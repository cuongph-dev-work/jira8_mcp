import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { normalizeAdfValue } from "../jira/adf.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  assertSingleTransitionSelector,
  resolveTransitionIdByName,
} from "../jira/transition-resolution.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";

const issueKeySchema = z
  .string()
  .min(1, "issueKey is required")
  .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)");

const transitionItemSchema = z.object({
  issueKey: issueKeySchema,
  transitionId: z.string().min(1).optional(),
  transitionName: z.string().min(1).optional(),
  comment: z.union([z.string(), z.record(z.unknown())]).optional(),
  fields: z.record(z.unknown()).optional(),
});

export const bulkTransitionIssuesSchema = z.object({
  dryRun: z.boolean(),
  issues: z.array(transitionItemSchema).min(1).max(25),
});

export async function handleBulkTransitionIssues(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = bulkTransitionIssuesSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  for (const item of parsed.data.issues) {
    try {
      assertSingleTransitionSelector(item);
    } catch (err: unknown) {
      if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
      throw err;
    }
  }

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
  const rows: string[] = [];
  let failures = 0;

  for (const item of parsed.data.issues) {
    try {
      let transitionId = item.transitionId ?? "";
      let transitionName = item.transitionName ?? "";
      if (item.transitionName) {
        const transitions = await client.getTransitions(item.issueKey);
        const resolved = resolveTransitionIdByName(transitions, item.transitionName);
        transitionId = resolved.id;
        transitionName = resolved.name;
      }

      const payload: {
        transition: { id: string };
        update?: Record<string, unknown>;
        fields?: Record<string, unknown>;
      } = { transition: { id: transitionId } };

      if (item.comment !== undefined) {
        payload.update = {
          comment: [{ add: { body: normalizeAdfValue(item.comment) } }],
        };
      }
      if (item.fields) {
        payload.fields = buildUpdateIssuePayload(item.fields).fields;
      }

      if (!parsed.data.dryRun) {
        await client.transitionIssue(item.issueKey, payload);
      }

      rows.push(
        `| ${parsed.data.dryRun ? "DRY_RUN" : "OK"} | ${item.issueKey} | ${transitionId} | ${transitionName || "—"} | ${parsed.data.dryRun ? "not applied" : "transitioned"} |`
      );
    } catch (err: unknown) {
      failures += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      rows.push(`| ERROR | ${item.issueKey} | — | — | ${message} |`);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: [
          `# Bulk transition issues`,
          "",
          `**Mode:** ${parsed.data.dryRun ? "DRY_RUN" : "APPLY"}`,
          "",
          `| Status | Issue | Transition ID | Transition Name | Result |`,
          `|---|---|---|---|---|`,
          ...rows,
        ].join("\n"),
      },
    ],
    ...(failures > 0 ? { isError: true as const } : {}),
  };
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
