import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

export const getIssueHistorySchema = z.object({
  issueKey: z.string().min(1).regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key"),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

export async function handleGetIssueHistory(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getIssueHistorySchema.safeParse(rawInput);
  if (!parsed.success) return errorContent(`Invalid input: ${parsed.error.errors.map((e) => e.message).join("; ")}`);

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(cfg.JIRA_SESSION_FILE, cfg.JIRA_BASE_URL, cfg.JIRA_VALIDATE_PATH);
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const { issueKey, startAt, maxResults } = parsed.data;
    const result = await new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies).getIssueHistory(issueKey, startAt, maxResults);
    const range = result.histories.length === 0
      ? `none (offset ${result.startAt}) of ${result.total}`
      : `${result.startAt + 1}-${Math.min(result.startAt + result.histories.length, result.total)} of ${result.total}`;
    const lines = [`# Issue History — ${result.issueKey}`, "", `**Showing:** ${range}`, ""];
    if (result.histories.length === 0) lines.push("_No history found._");
    for (const history of result.histories) {
      lines.push(`---`, `**${history.created}** by **${history.author ?? "Unknown"}**`);
      if (history.items.length === 0) lines.push("_No field details._");
      for (const item of history.items) {
        const from = item.fromString ?? item.from ?? "(empty)";
        const to = item.toString ?? item.to ?? "(empty)";
        lines.push(`- **${item.field || "Unknown field"}:** ${from} → ${to}`);
      }
    }
    if (result.startAt + result.histories.length < result.total) {
      lines.push("", `More history is available. Call jira_get_issue_history with issueKey "${result.issueKey}", startAt ${result.startAt + result.histories.length}, and maxResults ${result.maxResults}.`);
    }
    const hint = navigationHint(`jira_get_issue({issueKey: "${result.issueKey}"}) for current issue details`);
    return { content: [{ type: "text", text: lines.join("\n") + hint }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

function errorContent(message: string) { return { content: [{ type: "text" as const, text: message }], isError: true as const }; }
function authErrorContent(code: string, message: string) { return { content: [{ type: "text" as const, text: `[${code}] ${message}` }], isError: true as const }; }
