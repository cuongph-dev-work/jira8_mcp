import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

const issueKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issue key must be valid");

const bulkLinkItemSchema = z.object({
  inwardIssueKey: issueKeySchema,
  outwardIssueKey: issueKeySchema,
  linkType: z.string().min(1, "linkType is required"),
  comment: z.string().optional(),
});

export const bulkLinkIssuesSchema = z.object({
  links: z.array(bulkLinkItemSchema).min(1).max(25),
});

export async function handleBulkLinkIssues(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = bulkLinkIssuesSchema.safeParse(rawInput);
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

  for (const link of parsed.data.links) {
    try {
      const result = await client.linkIssues({
        type: { name: link.linkType },
        inwardIssue: { key: link.inwardIssueKey },
        outwardIssue: { key: link.outwardIssueKey },
        ...(link.comment !== undefined ? { comment: { body: link.comment } } : {}),
      });
      rows.push(
        `| OK | ${link.inwardIssueKey} | ${link.outwardIssueKey} | ${link.linkType} | ${result.linkId} |`
      );
    } catch (err: unknown) {
      failures += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      rows.push(
        `| ERROR | ${link.inwardIssueKey} | ${link.outwardIssueKey} | ${link.linkType} | ${message} |`
      );
    }
  }

  const lines = [
    `✅ **Bulk link complete**`,
    "",
    `| Status | Inward Issue | Outward Issue | Link Type | Result |`,
    `|---|---|---|---|---|`,
    ...rows,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }], isError: failures > 0 || undefined };
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
