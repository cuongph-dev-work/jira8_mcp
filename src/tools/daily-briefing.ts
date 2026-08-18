import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";
import type { JiraIssue, JiraIssueSummary } from "../types.js";
import { navigationHint, todayLocalDate } from "../utils.js";
import { collectJiraDaily, type JiraDailyCollection } from "./daily.js";

const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]+$/;
dayjs.extend(customParseFormat);

export const jiraDailyBriefingSchema = z.object({
  projectKey: z.string().trim().regex(PROJECT_KEY_PATTERN, "projectKey must be a Jira project key, e.g. PROJ"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => dayjs(value, "YYYY-MM-DD", true).isValid(), "date must be yyyy-MM-dd").default(todayLocalDate()),
  maxConcerns: z.number().int().min(1).max(20).default(5),
  audience: z.string().trim().min(1).default("project manager"),
});

export type JiraDailyBriefingInput = z.infer<typeof jiraDailyBriefingSchema>;
type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type Concern = { issue: JiraIssueSummary; severity: "High" | "Medium" | "Risk"; evidence: string; attention: string; rank: number };

export async function handleJiraDailyBriefing(rawInput: unknown, cfg: Config): Promise<ToolResult> {
  const parsed = jiraDailyBriefingSchema.safeParse(rawInput);
  if (!parsed.success) return { content: [{ type: "text", text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join("; ")}` }], isError: true };
  const input = parsed.data;
  try {
    const data = await collectJiraDaily({ projectKey: input.projectKey, date: input.date, maxBlockers: input.maxConcerns }, cfg);
    const concerns = rankConcerns(data, input.date).slice(0, input.maxConcerns);
    const evidence = await fetchEvidence(concerns, cfg);
    return { content: [{ type: "text", text: renderBriefing(input, data, concerns, evidence) }] };
  } catch (error: unknown) {
    const message = isMcpError(error) ? `[${error.code}] ${error.message}` : error instanceof Error ? error.message : "Unable to produce a reliable Jira briefing";
    return { content: [{ type: "text", text: `Không thể tạo briefing đáng tin cậy từ Jira: ${message}` }], isError: true };
  }
}

async function fetchEvidence(concerns: Concern[], cfg: Config): Promise<Map<string, JiraIssue>> {
  if (!concerns.length) return new Map();
  const cookies = await loadAndValidateSession(cfg.JIRA_SESSION_FILE, cfg.JIRA_BASE_URL, cfg.JIRA_VALIDATE_PATH);
  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, cookies);
  const results = await Promise.all(concerns.map(async (concern) => [concern.issue.key, await client.getIssue(concern.issue.key)] as const));
  return new Map(results);
}

function renderBriefing(input: JiraDailyBriefingInput, data: JiraDailyCollection, concerns: Concern[], evidence: Map<string, JiraIssue>): string {
  const overall = concerns.some((item) => item.severity === "High") ? "Red" : concerns.length ? "Amber" : "Green";
  const done = data.details.filter(isDone).length;
  const inProgress = data.details.filter((item) => /progress/i.test(item.status) && !isDone(item)).length;
  const weighted = weightedProgress(data.details);
  const lines = [
    "## Daily Delivery Briefing", "", `Project: ${input.projectKey}`, `Date: ${input.date}`, `Overall: ${overall}`, "",
    "### Executive summary", `${input.audience}: ${summarySentence(data, overall)}.`, "",
    `- Active: ${data.active.total}`, `- In progress: ${inProgress}`, `- Done: ${done}`, `- Due today: ${data.dueToday.total}`, `- Overdue: ${data.overdue.total}`, `- Weighted progress: ${weighted}`, "",
    "### Top concerns",
  ];
  if (!concerns.length) lines.push("- None identified from available Jira data.");
  concerns.forEach((concern, index) => {
    const detail = evidence.get(concern.issue.key);
    lines.push(`${index + 1}. ${concern.issue.key} - ${concern.issue.summary}`);
    lines.push(`   - Severity: ${concern.severity}`, `   - Evidence: Jira fact: ${concern.evidence}${detail?.status ? `; current status ${detail.status}` : ""}`, `   - Owner: ${detail?.assignee ?? concern.issue.assignee ?? "Unassigned"}`, `   - Management attention: ${concern.attention}`);
  });
  lines.push("", "### On track", ...onTrack(data), "", "### Questions for owners", ...questions(concerns), "", "### Management decisions needed", concerns.length ? "- Confirm priority and owner for the concerns above." : "- None identified", "", "### Data limitations");
  if (data.linkFailures) lines.push(`- ${data.linkFailures} dependency lookup(s) failed; base Jira totals are retained.`);
  if (!data.details.length) lines.push("- No issues were returned by the current Jira searches.");
  if (!data.linkFailures && data.details.length) lines.push("- None identified.");
  lines.push("", "_Read-only briefing: no Jira changes were made._", navigationHint("`jira_get_issue({issueKey: \"<key>\"})` for details", "`jira_get_issue_links({issueKey: \"<key>\"})` for dependencies"));
  return lines.join("\n");
}

function rankConcerns(data: JiraDailyCollection, date: string): Concern[] {
  const rows: Concern[] = [];
  const linked = new Map<string, (typeof data.blockers)[number]>();
  for (const row of data.blockers) {
    const existing = linked.get(row.issue.key);
    if (!existing || row.source === "Jira link") linked.set(row.issue.key, row);
  }
  for (const issue of data.details) {
    if (isDone(issue)) continue;
    const overdue = Boolean(issue.dueDate && issue.dueDate < date);
    const dueToday = issue.dueDate === date;
    const stale = dayjs(date).diff(dayjs(issue.updated), "day") >= 30;
    const link = linked.get(issue.key);
    let concern: Concern | null = null;
    if (link?.source === "Jira link") concern = { issue, severity: overdue ? "High" : "Medium", evidence: `Jira dependency: ${link.dependency}`, attention: "Review dependency and delivery impact.", rank: overdue ? 0 : 1 };
    else if (link?.source === "Text heuristic") concern = { issue, severity: overdue ? "High" : "Medium", evidence: "Detected signal in Jira text/labels; no confirmed dependency link.", attention: "Validate the blocker with the owner and linked team.", rank: overdue ? 0 : 1 };
    else if (overdue) concern = { issue, severity: "Risk", evidence: `Due date ${issue.dueDate}; overdue as of ${date}.`, attention: "Confirm recovery action and ownership.", rank: 2 };
    else if (dueToday) concern = { issue, severity: "Risk", evidence: `Due today (${date}) and unresolved.`, attention: "Confirm today's delivery status.", rank: 3 };
    else if (stale) concern = { issue, severity: "Risk", evidence: `No update since ${issue.updated}.`, attention: "Ask owner for current status.", rank: 4 };
    else if (!issue.assignee) concern = { issue, severity: "Risk", evidence: "Jira assignee is missing.", attention: "Assign a responsible owner.", rank: 5 };
    else if (!issue.progressWbsGantt && !issue.percentDone) concern = { issue, severity: "Risk", evidence: "Jira progress is missing.", attention: "Update progress evidence.", rank: 6 };
    if (concern) rows.push(concern);
  }
  return rows.sort((a, b) => a.rank - b.rank || a.issue.key.localeCompare(b.issue.key));
}

function summarySentence(data: JiraDailyCollection, overall: string): string {
  if (!data.details.length) return "No issues were found and no risk signal was detected in the current Jira data";
  return `${overall} based on ${data.active.total} active issue(s), ${data.overdue.total} overdue item(s), and ${data.dueToday.total} due-today item(s)`;
}

function onTrack(data: JiraDailyCollection): string[] {
  const points: string[] = [];
  if (data.recentlyCompleted.total) points.push(`- ${data.recentlyCompleted.total} issue(s) completed in the requested window.`);
  if (!data.overdue.total) points.push("- No overdue unresolved items were returned.");
  if (!points.length) points.push("- No positive signal available beyond the reported Jira facts.");
  return points.slice(0, 3);
}

function questions(concerns: Concern[]): string[] {
  if (!concerns.length) return ["- None identified."];
  return concerns.slice(0, 3).map((item) => `- ${item.issue.key}: what is the current status and next confirmed action?`);
}

function isDone(issue: JiraIssueSummary): boolean { return issue.statusCategory?.toLowerCase() === "done" || /^(cancel|resolved|closed)$/i.test(issue.status); }

function weightedProgress(issues: JiraIssueSummary[]): string {
  let weighted = 0; let weight = 0;
  for (const issue of issues) {
    if (isDone(issue) || !issue.originalEstimateSeconds || issue.originalEstimateSeconds <= 0) continue;
    const raw = issue.progressWbsGantt ?? issue.percentDone;
    const value = raw == null ? Number.NaN : Number(String(raw).match(/-?\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) { weighted += value * issue.originalEstimateSeconds; weight += issue.originalEstimateSeconds; }
  }
  return weight ? `${(weighted / weight).toFixed(1)}%` : "N/A";
}
