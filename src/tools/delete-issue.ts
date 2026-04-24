import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const deleteIssueSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  deleteSubtasks: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Also delete all subtasks of this issue. Default false — if the issue has subtasks and this is false, Jira will reject the request with a 400 error."
    ),
});

export async function handleDeleteIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = deleteIssueSchema.safeParse(rawInput);
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
    await client.deleteIssue(parsed.data.issueKey, parsed.data.deleteSubtasks);

    const subtaskNote = parsed.data.deleteSubtasks
      ? "Subtasks were also deleted."
      : "Subtasks were NOT deleted.";

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Issue deleted**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${parsed.data.issueKey} |`,
            `| **Subtasks deleted** | ${parsed.data.deleteSubtasks ? "Yes" : "No"} |`,
            "",
            subtaskNote,
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
