import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const cloneIssueSchema = z.object({
  sourceIssueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "sourceIssueKey must be a valid Jira key"),
  summaryPrefix: z.string().min(1).optional().default("Clone of"),
  fields: z.record(z.unknown()).optional().describe("Optional field overrides for the cloned issue."),
});

export async function handleCloneIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = cloneIssueSchema.safeParse(rawInput);
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

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const created = await client.cloneIssue(parsed.data);
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Issue cloned**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Source** | ${parsed.data.sourceIssueKey} |`,
            `| **Clone** | ${created.key} |`,
            `| **URL** | ${created.url} |`,
          ].join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
