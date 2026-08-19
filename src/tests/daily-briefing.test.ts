import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpError } from "../errors.js";
import { handleJiraDailyBriefing, jiraDailyBriefingSchema } from "../tools/daily-briefing.js";

const { mockLoadSession, mockSearchIssues, mockGetIssue, mockGetIssueLinks } = vi.hoisted(() => ({
  mockLoadSession: vi.fn(),
  mockSearchIssues: vi.fn(),
  mockGetIssue: vi.fn(),
  mockGetIssueLinks: vi.fn(),
}));

vi.mock("../auth/session-manager.js", () => ({ loadAndValidateSession: mockLoadSession }));
vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: class {
    searchIssues = mockSearchIssues;
    getIssue = mockGetIssue;
    getIssueLinks = mockGetIssueLinks;
  },
}));

const config = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself",
} as never;

const issue = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  summary: `${key} summary`,
  status: "In Progress",
  statusCategory: "indeterminate",
  issueType: "Task",
  assignee: "Alice",
  priority: "High",
  created: "2026-08-01",
  updated: "2026-08-17",
  dueDate: null,
  url: `https://jira.example.com/browse/${key}`,
  labels: [],
  description: null,
  originalEstimate: "1h",
  originalEstimateSeconds: 3600,
  remainingEstimate: null,
  timeSpent: null,
  defectOwner: null,
  planStartDate: null,
  actualStartDate: null,
  actualEndDate: null,
  severity: null,
  defectOrigin: null,
  progressWbsGantt: "50",
  percentDone: null,
  typeOfWork: null,
  ...overrides,
});

describe("jiraDailyBriefingSchema", () => {
  it("defaults date, concern limit, and audience", () => {
    expect(jiraDailyBriefingSchema.parse({ projectKey: "PROJ" })).toMatchObject({
      projectKey: "PROJ", maxConcerns: 5, audience: "project manager",
    });
  });

  it("rejects invalid project keys and concern limits", () => {
    expect(jiraDailyBriefingSchema.safeParse({ projectKey: "bad" }).success).toBe(false);
    expect(jiraDailyBriefingSchema.safeParse({ projectKey: "PROJ", date: "2026-02-30" }).success).toBe(false);
    expect(jiraDailyBriefingSchema.safeParse({ projectKey: "PROJ", maxConcerns: 0 }).success).toBe(false);
    expect(jiraDailyBriefingSchema.safeParse({ projectKey: "PROJ", maxConcerns: 21 }).success).toBe(false);
  });
});

describe("handleJiraDailyBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({ cookieHeader: "sid=abc" });
    mockSearchIssues
      .mockResolvedValueOnce({ total: 2, issues: [issue("PROJ-1", { description: "blocked by API" }), issue("PROJ-2", { dueDate: "2026-08-17" })] })
      .mockResolvedValueOnce({ total: 1, issues: [issue("PROJ-3", { dueDate: "2026-08-18" })] })
      .mockResolvedValueOnce({ total: 1, issues: [issue("PROJ-2", { dueDate: "2026-08-17" })] })
      .mockResolvedValueOnce({ total: 0, issues: [] });
    mockGetIssue.mockImplementation(async (key: string) => issue(key));
    mockGetIssueLinks.mockImplementation(async (key: string) => ({ issueKey: key, links: [] }));
  });

  it("renders the fixed Vietnamese briefing and limits evidence calls", async () => {
    const result = await handleJiraDailyBriefing({ projectKey: "PROJ", date: "2026-08-18", maxConcerns: 2 }, config);
    expect(result.isError).toBeUndefined();
    expect(mockSearchIssues).toHaveBeenCalledTimes(4);
    expect(mockGetIssue).toHaveBeenCalledTimes(2);
    const text = result.content[0]?.text ?? "";
    for (const heading of ["**Daily brief dự án PROJ — 18/08/2026**", "**Tổng quan: 🟠 / cần theo dõi**", "**Các điểm cần quản lý chú ý**", "**Việc cần chốt hôm nay**"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("[PROJ-1](https://jira.example.com/browse/PROJ-1)");
    expect(text).toContain("[PROJ-2](https://jira.example.com/browse/PROJ-2)");
    expect(text).toContain("phát hiện tín hiệu blocker");
    expect(text).toContain("quá hạn từ 17/08");
    expect(text).toContain("Báo cáo chỉ đọc, không có thay đổi nào được ghi vào Jira.");
    expect(text).not.toContain("Overall: Amber");
    expect(text).not.toContain("## Daily Delivery Briefing");
  });

  it("returns Green and N/A progress for an empty project", async () => {
    mockSearchIssues.mockReset();
    mockSearchIssues.mockResolvedValue({ total: 0, issues: [] });
    const result = await handleJiraDailyBriefing({ projectKey: "PROJ", date: "2026-08-18" }, config);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("**Tổng quan: 🟢 / ổn**");
    expect(text).toContain("Weighted progress: N/A");
    expect(text).toContain("Không có tín hiệu rủi ro từ dữ liệu Jira hiện tại.");
    expect(text).toContain("Không có việc cần chốt từ dữ liệu Jira hiện tại.");
    expect(text).not.toContain("Overall: Green");
    expect(mockGetIssue).not.toHaveBeenCalled();
  });

  it("returns an error for authentication and search failures", async () => {
    mockLoadSession.mockRejectedValueOnce(new McpError("AUTH_REQUIRED", "No session"));
    expect((await handleJiraDailyBriefing({ projectKey: "PROJ" }, config)).isError).toBe(true);
    mockLoadSession.mockResolvedValue({ cookieHeader: "sid=abc" });
    mockSearchIssues.mockReset();
    mockSearchIssues.mockRejectedValue(new McpError("JIRA_HTTP_ERROR", "down"));
    expect((await handleJiraDailyBriefing({ projectKey: "PROJ" }, config)).isError).toBe(true);
  });
});
