import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { normalizeJiraBody } from "../jira/body-normalizer.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const commentItemSchema = z.object({
  body: z.string().describe("Comment body as plain text or Markdown (converted to Jira Wiki Markup)."),
  bodyFormat: z
    .enum(["plain", "markdown"])
    .optional()
    .default("markdown")
    .describe("How to interpret body: markdown (default, converts to Jira Wiki Markup) or plain."),
});

export const addCommentsSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  comments: z
    .array(commentItemSchema)
    .min(1, "At least one comment is required")
    .max(10, "Maximum 10 comments per call"),
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(5000)
    .optional()
    .default(300)
    .describe("Delay in ms between sequential comment additions (0–5000, default 300). Increase if hitting Jira rate limits."),
});

export type AddCommentsInput = z.infer<typeof addCommentsSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface CommentResult {
  index: number;
  status: "ok" | "error";
  id?: string;
  url?: string;
  error?: string;
}

export async function handleAddComments(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = addCommentsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueKey, comments, delayMs } = parsed.data;

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
  const results: CommentResult[] = [];
  let hasError = false;

  for (let i = 0; i < comments.length; i++) {
    const item = comments[i]!;
    try {
      const wikiBody = normalizeJiraBody(item.body, item.bodyFormat);
      const comment = await client.addComment(issueKey, { body: wikiBody });
      results.push({ index: i, status: "ok", id: comment.id, url: comment.url });
    } catch (err: unknown) {
      hasError = true;
      const message = isMcpError(err)
        ? `[${err.code}] ${err.message}`
        : err instanceof Error
        ? err.message
        : String(err);
      results.push({ index: i, status: "error", error: message });
    }

    // Delay between comments (skip after last one)
    if (i < comments.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const successCount = results.filter((r) => r.status === "ok").length;
  const lines: string[] = [
    hasError ? "⚠️ **Bulk comment: partial success**" : "✅ **Bulk comment: all added**",
    "",
    `**Issue:** ${issueKey}`,
    `**Total:** ${comments.length} | **Success:** ${successCount} | **Failed:** ${comments.length - successCount}`,
    "",
    "| # | Status | Comment ID | URL / Error |",
    "|---|---|---|---|",
  ];

  for (const r of results) {
    if (r.status === "ok") {
      lines.push(`| ${r.index + 1} | ✅ ok | ${r.id} | ${r.url} |`);
    } else {
      lines.push(`| ${r.index + 1} | ❌ error | — | ${r.error ?? "unknown"} |`);
    }
  }

  return {
    content: [{ type: "text", text: lines.join("\n") + navigationHint(
      `\`jira_get_comments({issueKey: "${issueKey}"})\` to view all comments`,
    ) }],
    ...(hasError ? { isError: true } : {}),
  };
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
