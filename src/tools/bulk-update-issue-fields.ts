import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";

const issueKeySchema = z
  .string()
  .min(1, "issueKey is required")
  .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)");

export const bulkUpdateIssueFieldsSchema = z.object({
  dryRun: z.boolean(),
  issues: z
    .array(
      z.object({
        issueKey: issueKeySchema,
        fields: z.record(z.unknown()),
      })
    )
    .min(1)
    .max(25),
});

export async function handleBulkUpdateIssueFields(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = bulkUpdateIssueFieldsSchema.safeParse(rawInput);
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
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
  const rows: string[] = [];
  let failures = 0;

  for (const item of parsed.data.issues) {
    try {
      const payload = buildUpdateIssuePayload(item.fields);
      if (!parsed.data.dryRun) {
        await client.updateIssueFields(item.issueKey, payload);
      }
      rows.push(
        `| ${parsed.data.dryRun ? "DRY_RUN" : "OK"} | ${item.issueKey} | ${Object.keys(payload.fields).join(", ")} | ${parsed.data.dryRun ? "not applied" : "updated"} |`
      );
    } catch (err: unknown) {
      failures += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      rows.push(`| ERROR | ${item.issueKey} | — | ${message} |`);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: [
          `# Bulk issue field update`,
          "",
          `**Mode:** ${parsed.data.dryRun ? "DRY_RUN" : "APPLY"}`,
          "",
          `| Status | Issue | Fields | Result |`,
          `|---|---|---|---|`,
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
