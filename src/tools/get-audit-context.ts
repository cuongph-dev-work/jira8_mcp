import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const getAuditContextSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  includeComments: z.boolean().optional().default(true),
  maxComments: z.number().int().min(1).max(100).optional().default(20),
});

export async function handleGetAuditContext(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getAuditContextSchema.safeParse(rawInput);
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
    const [issue, links, subtasks, comments] = await Promise.all([
      client.getIssue(parsed.data.issueKey),
      client.getIssueLinks(parsed.data.issueKey),
      client.getSubtasks(parsed.data.issueKey),
      parsed.data.includeComments
        ? client.getComments(parsed.data.issueKey, parsed.data.maxComments)
        : Promise.resolve([]),
    ]);

    const lines = [
      `# Audit Context — ${issue.key}`,
      "",
      `## Issue`,
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Summary | ${issue.summary} |`,
      `| Type | ${issue.issueType} |`,
      `| Status | ${issue.status} |`,
      `| Priority | ${issue.priority ?? "—"} |`,
      `| Assignee | ${issue.assignee ?? "—"} |`,
      `| Reporter | ${issue.reporter ?? "—"} |`,
      `| URL | ${issue.url} |`,
      "",
      `## Description`,
      "",
      issue.description ?? "_No description._",
      "",
      `## Links (${links.links.length})`,
      "",
    ];

    if (links.links.length === 0) {
      lines.push("_No links._");
    } else {
      for (const link of links.links) {
        lines.push(`- ${link.direction} ${link.type} ${link.issueKey}: ${link.summary} [${link.status}]`);
      }
    }

    lines.push("", `## Subtasks (${subtasks.subtasks.length})`, "");
    if (subtasks.subtasks.length === 0) {
      lines.push("_No subtasks._");
    } else {
      for (const subtask of subtasks.subtasks) {
        lines.push(`- ${subtask.key}: ${subtask.summary} [${subtask.status}]`);
      }
    }

    lines.push("", `## Comments (${comments.length})`, "");
    if (comments.length === 0) {
      lines.push("_No comments included._");
    } else {
      for (const comment of comments) {
        lines.push(`### Comment ${comment.id} — ${comment.author ?? "Unknown"} — ${comment.created}`);
        lines.push("");
        lines.push(comment.body ?? "_empty_");
        lines.push("");
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
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
