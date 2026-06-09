import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTimesheetApprovalLogSchema, handleGetTimesheetApprovalLog } from "../tools/get-timesheet-approval-log.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { loadAndValidateSession } from "../auth/session-manager.js";

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself" as const,
  ATTACHMENT_WORKSPACE: "downloads",
  LOG_LEVEL: "info" as const,
  PLAYWRIGHT_HEADLESS: false as const,
  PLAYWRIGHT_BROWSER: "chromium" as const,
};

// Hoisted mocks
vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => {
  return {
    JiraHttpClient: vi.fn().mockImplementation(() => ({
      getTimesheetApprovalLog: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("getTimesheetApprovalLogSchema", () => {
  it("validates correct input", () => {
    const result = getTimesheetApprovalLogSchema.safeParse({
      teamId: 115,
      periodStartDate: "2026-04-20",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive teamId", () => {
    const result = getTimesheetApprovalLogSchema.safeParse({
      teamId: 0,
      periodStartDate: "2026-04-20",
    });
    expect(result.success).toBe(false);
  });

  it("rejects bad date format", () => {
    const result = getTimesheetApprovalLogSchema.safeParse({
      teamId: 115,
      periodStartDate: "20-04-2026",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleGetTimesheetApprovalLog", () => {
  let mockGetLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLog = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      getTimesheetApprovalLog: mockGetLog,
    }) as any);
  });

  it("formats log with active entries", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });

    const mockMap = new Map([
      [
        "quocpa@runsystem.net",
        [
          {
            userKey: "quocpa@runsystem.net",
            displayName: "Phạm Anh Quốc",
            status: "waiting_for_approval",
            workedSeconds: 0,
            submittedSeconds: 144000,
            requiredSeconds: 144000,
            periodDateFrom: "2026-04-20",
            periodDateTo: "2026-04-26",
            actionName: "submit",
            actionComment: "All done",
            actionCreated: "2026-04-24T19:20:10.000",
            reviewerDisplayName: "Phan Hùng Cường",
            reviewerUsername: "cuongph@runsystem.net",
            actorDisplayName: "Phạm Anh Quốc",
            actorUsername: "quocpa@runsystem.net",
          },
        ],
      ],
    ]);

    mockGetLog.mockResolvedValue(mockMap);

    const result = await handleGetTimesheetApprovalLog(
      { teamId: 115, periodStartDate: "2026-04-20" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Phạm Anh Quốc");
    expect(text).toContain("📤 Submitted");
    expect(text).toContain("Phan Hùng Cường");
    expect(text).toContain("2026-04-20");
  });

  it("returns no-records message when map is empty", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockGetLog.mockResolvedValue(new Map());

    const result = await handleGetTimesheetApprovalLog(
      { teamId: 115, periodStartDate: "2026-04-20" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No approval log records found");
  });

  it("shows no activity message when all entries are empty arrays", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    const mockMap = new Map([
      ["JIRAUSER12942", []],
      ["phunt@runsystem.net", []],
    ]);
    mockGetLog.mockResolvedValue(mockMap);

    const result = await handleGetTimesheetApprovalLog(
      { teamId: 115, periodStartDate: "2026-04-20" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("**Members in team:** 2");
    expect(text).toContain("**Members with activity:** 0");
    expect(text).toContain("No approval actions recorded yet");
  });

  it("returns validation error for bad input", async () => {
    const result = await handleGetTimesheetApprovalLog(
      { teamId: -1, periodStartDate: "bad-date" },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
