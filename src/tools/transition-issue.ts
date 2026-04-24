import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { normalizeAdfValue } from "../jira/adf.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";

export const transitionIssueSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  transitionId: z.string().min(1, "transitionId is required"),
  comment: z.union([z.string(), z.record(z.unknown())]).optional(),
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
    const payload: {
      transition: { id: string };
      update?: Record<string, unknown>;
      fields?: Record<string, unknown>;
    } = {
      transition: { id: parsed.data.transitionId },
    };

    if (parsed.data.comment !== undefined) {
      payload.update = {
        comment: [{ add: { body: normalizeAdfValue(parsed.data.comment) } }],
      };
    }

    if (parsed.data.fields) {
      payload.fields = buildUpdateIssuePayload(parsed.data.fields).fields;
    }

    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
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
            `| **Transition ID** | ${parsed.data.transitionId} |`,
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
