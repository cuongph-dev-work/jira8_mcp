import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const assignIssueSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key"),
  assigneeName: z.string().optional(),
  assigneeKey: z.string().optional(),
});

export async function handleAssignIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = assignIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  if (!parsed.data.assigneeName && !parsed.data.assigneeKey) {
    return errorContent(`[INVALID_INPUT] Either assigneeName or assigneeKey is required`);
  }
  if (parsed.data.assigneeName && parsed.data.assigneeKey) {
    return errorContent(`[INVALID_INPUT] Provide only one of assigneeName or assigneeKey`);
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
    const payload = parsed.data.assigneeKey
      ? { key: parsed.data.assigneeKey }
      : { name: parsed.data.assigneeName };
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    await client.assignIssue(parsed.data.issueKey, payload);

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Issue assigned**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${parsed.data.issueKey} |`,
            `| **Assignee** | ${parsed.data.assigneeName ?? parsed.data.assigneeKey} |`,
            `| **URL** | ${cfg.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${parsed.data.issueKey} |`,
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
