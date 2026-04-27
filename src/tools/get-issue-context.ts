import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { isMcpError } from "../errors.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { JiraIssue, JiraComment } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getIssueContextSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  maxDescriptionLength: z
    .number()
    .int()
    .min(0)
    .max(2000)
    .default(500)
    .describe("Max characters to include from description (0–2000, default 500). Set 0 to omit."),
  includeComments: z
    .boolean()
    .default(false)
    .describe(
      "Fetch and include recent comments (default false). Set true when using this tool as intake — " +
      "comments often contain requirement clarifications that affect analysis."
    ),
  maxComments: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Max comments to include when includeComments=true (1–20, default 5)."),
  includeHints: z
    .boolean()
    .default(false)
    .describe("Append navigation hints at the end (default false). Enable when this is the last step before user display."),
});

export type GetIssueContextInput = z.infer<typeof getIssueContextSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * MCP tool handler for `jira_get_issue_context`.
 * Returns a compact, token-efficient context snapshot of a single issue.
 *
 * By default: 1 API call (issue only). Set includeComments=true to fetch
 * comments in parallel — essential for intake use cases where requirement
 * clarifications live in comment threads.
 */
export async function handleGetIssueContext(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getIssueContextSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueKey, maxDescriptionLength, includeComments, maxComments, includeHints } = parsed.data;

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

  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);

  try {
    // Parallel fetch: issue always, comments only when opted in
    const [issue, comments] = await Promise.all([
      client.getIssue(issueKey),
      includeComments
        ? client.getComments(issueKey, maxComments)
        : Promise.resolve([] as JiraComment[]),
    ]);

    return {
      content: [
        {
          type: "text",
          text: formatCompact(issue, comments, { maxDescriptionLength, includeComments, includeHints }),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Compact formatter (exported for unit testing)
// ---------------------------------------------------------------------------

export interface FormatCompactOptions {
  maxDescriptionLength: number;
  includeComments: boolean;
  includeHints: boolean;
}

export function formatCompact(
  issue: JiraIssue,
  comments: JiraComment[],
  opts: FormatCompactOptions
): string {
  const { maxDescriptionLength, includeComments, includeHints } = opts;
  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────
  const priority = issue.priority ? ` · ${issue.priority}` : "";
  lines.push(`**${issue.key}** · ${issue.issueType} · ${issue.status}${priority}`);
  lines.push(`URL: ${issue.url}`);

  // ── People ──────────────────────────────────────────────────────────────
  lines.push("");
  lines.push(`Assignee: ${issue.assignee ?? "Unassigned"}  |  Reporter: ${issue.reporter ?? "—"}`);

  // ── Dates ───────────────────────────────────────────────────────────────
  const dateParts: string[] = [
    `Created: ${formatShortDate(issue.created)}`,
    `Updated: ${formatShortDate(issue.updated)}`,
  ];
  if (issue.dueDate) dateParts.push(`Due: ${issue.dueDate}`);
  lines.push(dateParts.join("  |  "));

  // ── Time tracking ───────────────────────────────────────────────────────
  const tt = issue.timeTracking;
  const ttParts: string[] = [];
  if (tt.originalEstimate) ttParts.push(`Estimated: ${tt.originalEstimate}`);
  if (tt.timeSpent) ttParts.push(`Logged: ${tt.timeSpent}`);
  if (tt.remainingEstimate) ttParts.push(`Remaining: ${tt.remainingEstimate}`);
  if (ttParts.length > 0) lines.push(ttParts.join("  |  "));

  // ── Relations / metadata ────────────────────────────────────────────────
  const metaParts: string[] = [];
  if (issue.parent) metaParts.push(`Parent: ${issue.parent}`);
  if (issue.epicLink) metaParts.push(`Epic: ${issue.epicLink}`);
  if (issue.labels.length > 0) metaParts.push(`Labels: ${issue.labels.join(", ")}`);
  if (issue.components.length > 0) metaParts.push(`Components: ${issue.components.join(", ")}`);
  if (issue.subtasks.length > 0) metaParts.push(`Sub-tasks: ${issue.subtasks.length}`);
  if (issue.attachments.length > 0) metaParts.push(`Attachments: ${issue.attachments.length}`);
  if (metaParts.length > 0) lines.push(metaParts.join("  |  "));

  // ── Resolution ──────────────────────────────────────────────────────────
  if (issue.resolution) {
    lines.push(`Resolution: ${issue.resolution}`);
  }

  // ── Description excerpt ─────────────────────────────────────────────────
  if (maxDescriptionLength > 0 && issue.description) {
    lines.push("");
    const desc = issue.description.trim();
    if (desc.length > maxDescriptionLength) {
      lines.push(`Description (first ${maxDescriptionLength} chars):`);
      lines.push(desc.slice(0, maxDescriptionLength) + "…");
    } else {
      lines.push("Description:");
      lines.push(desc);
    }
  }

  // ── Recent comments ──────────────────────────────────────────────────────
  // Only rendered when includeComments=true; each comment is a single line
  // (author · date: body excerpt) to stay compact.
  if (includeComments && comments.length > 0) {
    lines.push("");
    lines.push(`Recent Comments (${comments.length}):`);
    for (const c of comments) {
      const author = c.author ?? "—";
      const date = formatShortDate(c.created);
      const body = (c.body ?? "").replace(/\n+/g, " ").trim();
      const bodyExcerpt = body.length > 200 ? body.slice(0, 200) + "…" : body;
      lines.push(`[${c.id}] ${author} · ${date}: ${bodyExcerpt}`);
    }
  }

  // ── Navigation hints (opt-in only) ───────────────────────────────────────
  if (includeHints) {
    lines.push(navigationHint(
      `\`jira_get_issue({issueKey: "${issue.key}"})\` for full detail`,
      `\`jira_get_comments({issueKey: "${issue.key}"})\` for all comments`,
      `\`jira_get_transitions({issueKey: "${issue.key}"})\` to change status`,
    ));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats an ISO timestamp to a short readable date (e.g. "27 Apr 2026"). */
function formatShortDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `[${code}] ${message}\n\nRun: npm run jira-auth-login`,
      },
    ],
  };
}
