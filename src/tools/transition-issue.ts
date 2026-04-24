import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  assertSingleTransitionSelector,
  resolveTransitionIdByName,
} from "../jira/transition-resolution.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";
import type { JiraIssueTransition } from "../types.js";

export const transitionIssueSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  transitionId: z.string().min(1).optional(),
  transitionName: z.string().min(1).optional(),
  comment: z.string().optional(),
  fields: z.record(z.unknown()).optional(),
});

export async function handleTransitionIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = transitionIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  try {
    assertSingleTransitionSelector(parsed.data);
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    throw err;
  }

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return authErrorContent(err.code, err.message);
    }
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    let transition: JiraIssueTransition = {
      id: parsed.data.transitionId ?? "",
      name: parsed.data.transitionName ?? "",
      toStatus: null,
    };

    if (parsed.data.transitionName) {
      const transitions = await client.getTransitions(parsed.data.issueKey);
      transition = resolveTransitionIdByName(transitions, parsed.data.transitionName);
    }

    const payload: {
      transition: { id: string };
      update?: Record<string, unknown>;
      fields?: Record<string, unknown>;
    } = {
      transition: { id: transition.id },
    };

    if (parsed.data.comment !== undefined) {
      payload.update = {
        comment: [{ add: { body: parsed.data.comment } }],
      };
    }

    if (parsed.data.fields) {
      payload.fields = buildUpdateIssuePayload(parsed.data.fields).fields;
    }

    await client.transitionIssue(parsed.data.issueKey, payload);

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Transition applied**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${parsed.data.issueKey} |`,
            `| **Transition ID** | ${transition.id} |`,
            ...(transition.name ? [`| **Transition Name** | ${transition.name} |`] : []),
            `| **URL** | ${cfg.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${parsed.data.issueKey} |`,
          ].join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    if (err instanceof Error) {
      return errorContent(err.message);
    }
    throw err;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `[${code}] ${message}` }],
  };
}
