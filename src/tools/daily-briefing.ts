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

const OVERALL_LABEL = {
  Red: "🔴 / cần xử lý ngay",
  Amber: "🟠 / cần theo dõi",
  Green: "🟢 / ổn",
} as const;

type OverallStatus = keyof typeof OVERALL_LABEL;
type ConcernKind = "jira-link" | "heuristic" | "overdue" | "due-today" | "stale" | "missing-owner" | "missing-progress";

export const jiraDailyBriefingSchema = z.object({
  projectKey: z.string().trim().regex(PROJECT_KEY_PATTERN, "projectKey must be a Jira project key, e.g. PROJ"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => dayjs(value, "YYYY-MM-DD", true).isValid(), "date must be yyyy-MM-dd").default(todayLocalDate()),
  maxConcerns: z.number().int().min(1).max(20).default(5),
  audience: z.string().trim().min(1).default("project manager"),
});

export type JiraDailyBriefingInput = z.infer<typeof jiraDailyBriefingSchema>;
type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type Concern = {
  issue: JiraIssueSummary;
  severity: "High" | "Medium" | "Risk";
  rank: number;
  kind: ConcernKind;
  dependency?: string;
};
type WeightedProgress = { label: string; line: string };

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
  const overall: OverallStatus = concerns.some((item) => item.severity === "High") ? "Red" : concerns.length ? "Amber" : "Green";
  const done = data.details.filter(isDone).length;
  const inProgress = data.details.filter((item) => /progress/i.test(item.status) && !isDone(item)).length;
  const weighted = weightedProgress(data.details);
  const lines = [
    `**Daily brief dự án ${input.projectKey} — ${formatDisplayDate(input.date)}**`,
    "",
    `**Tổng quan: ${OVERALL_LABEL[overall]}**`,
    "",
    `- ${data.active.total} issue đang active`,
    `- ${inProgress} issue đang In Progress`,
    `- ${done} issue đã hoàn thành`,
    `- ${data.dueToday.total} issue đến hạn hôm nay`,
    `- ${data.overdue.total} issue quá hạn`,
    `- Weighted progress: ${weighted.line}`,
    "",
    "**Các điểm cần quản lý chú ý**",
    "",
  ];
  if (!concerns.length) {
    lines.push("- Không có tín hiệu rủi ro từ dữ liệu Jira hiện tại.");
  } else {
    for (const concern of concerns) {
      lines.push(formatConcernLine(concern, evidence.get(concern.issue.key)));
    }
  }
  lines.push("", "**Việc cần chốt hôm nay**", "");
  const actions = actionItems(data, concerns, weighted);
  if (!actions.length) {
    lines.push("- Không có việc cần chốt từ dữ liệu Jira hiện tại.");
  } else {
    actions.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }
  if (data.linkFailures) {
    lines.push("", `${data.linkFailures} lần tra cứu phụ thuộc thất bại; tổng số Jira vẫn được giữ nguyên.`);
  }
  lines.push(
    "",
    "Báo cáo chỉ đọc, không có thay đổi nào được ghi vào Jira.",
    navigationHint("`jira_get_issue({issueKey: \"<key>\"})` for details", "`jira_get_issue_links({issueKey: \"<key>\"})` for dependencies"),
  );
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
    if (link?.source === "Jira link") {
      concern = { issue, severity: overdue ? "High" : "Medium", rank: overdue ? 0 : 1, kind: "jira-link", dependency: link.dependency };
    } else if (link?.source === "Text heuristic") {
      concern = { issue, severity: overdue ? "High" : "Medium", rank: overdue ? 0 : 1, kind: "heuristic" };
    } else if (overdue) {
      concern = { issue, severity: "Risk", rank: 2, kind: "overdue" };
    } else if (dueToday) {
      concern = { issue, severity: "Risk", rank: 3, kind: "due-today" };
    } else if (stale) {
      concern = { issue, severity: "Risk", rank: 4, kind: "stale" };
    } else if (!issue.assignee) {
      concern = { issue, severity: "Risk", rank: 5, kind: "missing-owner" };
    } else if (!issue.progressWbsGantt && !issue.percentDone) {
      concern = { issue, severity: "Risk", rank: 6, kind: "missing-progress" };
    }
    if (concern) rows.push(concern);
  }
  return rows.sort((a, b) => a.rank - b.rank || a.issue.key.localeCompare(b.issue.key));
}

function formatConcernLine(concern: Concern, detail: JiraIssue | undefined): string {
  const status = detail?.status ?? concern.issue.status;
  const owner = detail?.assignee ?? concern.issue.assignee;
  const ownerText = owner?.trim() ? `owner ${owner}` : "chưa có owner";
  const parts = [`trạng thái ${status}`];
  const signal = concernSignal(concern);
  if (signal) parts.push(signal);
  return `- ${issueMarkdownLink(concern.issue)} — ${concern.issue.summary}: ${parts.join(", ")}; ${ownerText}.`;
}

function concernSignal(concern: Concern): string | null {
  switch (concern.kind) {
    case "jira-link":
      return `phụ thuộc Jira: ${concern.dependency ?? "đã xác nhận"}`;
    case "heuristic":
      return "phát hiện tín hiệu blocker; không có liên kết phụ thuộc đã xác nhận";
    case "overdue":
      return concern.issue.dueDate ? `quá hạn từ ${formatShortDate(concern.issue.dueDate)}` : "quá hạn";
    case "due-today":
      return "đến hạn hôm nay";
    case "stale":
      return `không cập nhật từ ${formatShortDate(concern.issue.updated)}`;
    case "missing-owner":
      return null;
    case "missing-progress":
      return "thiếu dữ liệu progress";
  }
}

function actionItems(data: JiraDailyCollection, concerns: Concern[], weighted: WeightedProgress): string[] {
  const items: string[] = [];
  if (data.overdue.total) {
    items.push(`Xác nhận owner và kế hoạch phục hồi cho ${data.overdue.total} issue quá hạn.`);
  }
  const blocker = concerns.find((item) => item.kind === "jira-link" || item.kind === "heuristic");
  if (blocker) {
    items.push(`Làm rõ blocker và hành động tiếp theo của ${issueMarkdownLink(blocker.issue)}.`);
  }
  if (data.dueToday.total) {
    items.push("Kiểm tra issue đến hạn hôm nay và cập nhật trạng thái trước cuối ngày.");
  }
  if (data.details.length && (weighted.label === "N/A" || weighted.label === "0,0%")) {
    items.push(`Xác minh chỉ số weighted progress đang hiển thị ${weighted.label}.`);
  }
  return items;
}

function isDone(issue: JiraIssueSummary): boolean {
  return issue.statusCategory?.toLowerCase() === "done" || /^(cancel|resolved|closed)$/i.test(issue.status);
}

function weightedProgress(issues: JiraIssueSummary[]): WeightedProgress {
  let weighted = 0;
  let weight = 0;
  for (const issue of issues) {
    if (isDone(issue) || !issue.originalEstimateSeconds || issue.originalEstimateSeconds <= 0) continue;
    const raw = issue.progressWbsGantt ?? issue.percentDone;
    const value = raw == null ? Number.NaN : Number(String(raw).match(/-?\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      weighted += value * issue.originalEstimateSeconds;
      weight += issue.originalEstimateSeconds;
    }
  }
  if (!weight) return { label: "N/A", line: "N/A" };
  const label = `${(weighted / weight).toFixed(1).replace(".", ",")}%`;
  if (label === "0,0%") {
    return { label, line: `**${label}** theo dữ liệu Jira, nên cần kiểm tra lại cách tính hoặc dữ liệu estimate` };
  }
  return { label, line: `**${label}**` };
}

function issueMarkdownLink(issue: { key: string; url: string }): string {
  return `[${issue.key}](${issue.url})`;
}

function formatDisplayDate(isoDate: string): string {
  return dayjs(isoDate).format("DD/MM/YYYY");
}

function formatShortDate(isoDate: string): string {
  return dayjs(isoDate).format("DD/MM");
}
