import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { normalizeJiraBody } from "../jira/body-normalizer.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

export const addCommentSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  body: z.string(),
  bodyFormat: z.enum(["plain", "markdown"]).default("markdown"),
});

export async function handleAddComment(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = addCommentSchema.safeParse(rawInput);
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
    const wikiBody = normalizeJiraBody(parsed.data.body, parsed.data.bodyFormat);
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const comment = await client.addComment(parsed.data.issueKey, { body: wikiBody });
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Comment added**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${comment.issueKey} |`,
            `| **Comment ID** | ${comment.id} |`,
            `| **URL** | ${comment.url} |`,
          ].join("\n") + navigationHint(
            `\`jira_get_comments({issueKey: "${comment.issueKey}"})\` to view all comments`,
          ),
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
