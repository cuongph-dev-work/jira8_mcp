import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTimesheetApprovalsSchema, handleGetTimesheetApprovals } from "../tools/get-timesheet-approvals.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { McpError } from "../errors.js";

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
      getTimesheetApprovals: vi.fn(),
    })),
  };
});

describe("getTimesheetApprovalsSchema", () => {
  it("validates correct input", () => {
    const valid = { teamId: 484, periodStartDate: "2026-04-27" };
    expect(getTimesheetApprovalsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid dates", () => {
    const invalid = { teamId: 484, periodStartDate: "04-27-2026" };
    expect(getTimesheetApprovalsSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects invalid teamId", () => {
    const invalid = { teamId: -1, periodStartDate: "2026-04-27" };
    expect(getTimesheetApprovalsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("handleGetTimesheetApprovals", () => {
  let mockGetTimesheetApprovals: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTimesheetApprovals = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      getTimesheetApprovals: mockGetTimesheetApprovals,
    }) as any);
  });

  it("returns auth error if session invalid", async () => {
    vi.mocked(loadAndValidateSession).mockRejectedValue(
      new McpError("SESSION_EXPIRED", "Auth failed")
    );

    const result = await handleGetTimesheetApprovals(
      { teamId: 484, periodStartDate: "2026-04-27" },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SESSION_EXPIRED");
  });

  it("formats approvals successfully", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    
    mockGetTimesheetApprovals.mockResolvedValue([
      {
        username: "cuongph",
        displayName: "Phan Hùng Cường",
        status: "open",
        workedSeconds: 12600,
        submittedSeconds: 0,
        requiredSeconds: 144000,
        requiredSecondsRelativeToday: 28800,
        periodDateFrom: "2026-04-27",
        periodDateTo: "2026-05-03",
      }
    ]);

    const result = await handleGetTimesheetApprovals(
      { teamId: 484, periodStartDate: "2026-04-27" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Phan Hùng Cường");
    expect(result.content[0].text).toContain("3.50h");
    expect(result.content[0].text).toContain("8.00h");
    expect(result.content[0].text).toContain("🟢 open");
  });
});
