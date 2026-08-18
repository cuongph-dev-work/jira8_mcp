import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { invalidInput, isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { escapeJqlString, navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { JiraIssueSummary } from "../types.js";

const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]+$/;
const EXCLUDED_STATUSES = ["Cancel", "Closed"] as const;

export const findStaleIssuesSchema = z.object({
  staleDays: z.number().int().min(1).max(3650).default(30),
  project: z.string().trim().regex(PROJECT_KEY_PATTERN, "project must be a Jira project key, e.g. PROJ").optional(),
  status: z.string().trim().min(1).optional(),
  assignee: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  startAt: z.number().int().min(0).default(0),
});

export type FindStaleIssuesInput = z.infer<typeof findStaleIssuesSchema>;

export function buildFindStaleIssuesJql(input: FindStaleIssuesInput): string {
  const clauses = [
    `updated <= -${input.staleDays}d`,
    `status NOT IN ("Cancel", "Closed")`,
  ];

  if (input.project) clauses.push(`project = ${input.project}`);
  if (input.status) clauses.push(`status = "${escapeJqlString(input.status)}"`);

  if (input.assignee === "me") {
    clauses.push("assignee = currentUser()");
  } else if (input.assignee === "unassigned") {
    clauses.push("assignee is EMPTY");
  } else if (input.assignee) {
    clauses.push(`assignee = "${escapeJqlString(input.assignee)}"`);
  }

  return `${clauses.join(" AND ")} ORDER BY updated ASC`;
}

export async function handleFindStaleIssues(
  rawInput: unknown,
  cfg: Config,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = findStaleIssuesSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorContent(`Invalid input: ${parsed.error.errors.map((error) => error.message).join("; ")}`);
  }

  const input = parsed.data;
  if (EXCLUDED_STATUSES.some((excluded) => excluded.toLowerCase() === input.status?.toLowerCase())) {
    const error = invalidInput(`status cannot be ${input.status}; stale issues exclude Cancel and Closed statuses.`);
    return errorContent(`[${error.code}] ${error.message}`);
  }

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH,
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
  const jql = buildFindStaleIssuesJql(input);

  try {
    const result = await client.searchIssues(jql, input.limit, input.startAt);
    return {
      content: [{ type: "text", text: formatFindStaleIssuesResult(jql, input, result.total, result.issues) }],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    throw err;
  }
}

function formatFindStaleIssuesResult(
  jql: string,
  input: FindStaleIssuesInput,
  total: number,
  issues: JiraIssueSummary[],
): string {
  const from = total === 0 ? 0 : input.startAt + 1;
  const to = input.startAt + issues.length;
  const lines = [
    "# Jira Stale Issues",
    "",
    `**Stale threshold:** ${input.staleDays} day(s)`,
    `**JQL:** \`${jql}\``,
    `**Total:** ${total} issue(s) found | Showing: ${from}-${to}`,
    "",
  ];

  if (issues.length === 0) {
    return `${lines.join("\n")}_No stale issues matched the filters._` +
      navigationHint(`\`jira_get_issue({issueKey: "<key>"})\` for full issue details`);
  }

  const rows = issues.map((issue) => [
    `| ${issue.key} | ${issue.summary} | ${issue.issueType} | ${issue.status} | ${issue.priority ?? "Unprioritized"} | ${issue.assignee ?? "Unassigned"} | ${issue.created} | ${issue.updated} | ${issue.url} |`,
  ].join("\n"));
  lines.push("| Key | Summary | Type | Status | Priority | Assignee | Created | Updated | URL |", "|---|---|---|---|---|---|---|---|---|", ...rows);

  const suggestions = [`\`jira_get_issue({issueKey: "<key>"})\` for full issue details`];
  if (to < total) {
    suggestions.push(`\`jira_find_stale_issues({staleDays: ${input.staleDays}, startAt: ${to}})\` for the next page`);
  }
  return lines.join("\n") + navigationHint(...suggestions);
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return errorContent(`[${code}] ${message}\n\nRun: npm run jira-auth-login`);
}
