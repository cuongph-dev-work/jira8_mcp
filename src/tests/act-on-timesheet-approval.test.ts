import { describe, it, expect, vi, beforeEach } from "vitest";
import { actOnTimesheetApprovalSchema, handleActOnTimesheetApproval } from "../tools/act-on-timesheet-approval.js";
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

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: vi.fn().mockImplementation(() => ({
    getCurrentUser: vi.fn(),
    actOnTimesheetApproval: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("actOnTimesheetApprovalSchema", () => {
  it("accepts approve with comment", () => {
    expect(
      actOnTimesheetApprovalSchema.safeParse({
        userKey: "lapdq@runsystem.net",
        periodDateFrom: "2026-04-20",
        action: "approve",
        comment: "ok",
      }).success
    ).toBe(true);
  });

  it("accepts reject with empty comment (defaults to empty string)", () => {
    const result = actOnTimesheetApprovalSchema.safeParse({
      userKey: "lapdq@runsystem.net",
      periodDateFrom: "2026-04-20",
      action: "reject",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.comment).toBe("");
  });

  it("accepts reopen action", () => {
    expect(
      actOnTimesheetApprovalSchema.safeParse({
        userKey: "lapdq@runsystem.net",
        periodDateFrom: "2026-04-20",
        action: "reopen",
      }).success
    ).toBe(true);
  });

  it("rejects invalid action", () => {
    expect(
      actOnTimesheetApprovalSchema.safeParse({
        userKey: "user@example.com",
        periodDateFrom: "2026-04-20",
        action: "delete",
      }).success
    ).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(
      actOnTimesheetApprovalSchema.safeParse({
        userKey: "user@example.com",
        periodDateFrom: "20/04/2026",
        action: "approve",
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleActOnTimesheetApproval", () => {
  let mockGetCurrentUser: ReturnType<typeof vi.fn>;
  let mockActOn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser = vi.fn();
    mockActOn = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      getCurrentUser: mockGetCurrentUser,
      actOnTimesheetApproval: mockActOn,
    }) as any);
  });

  it("approves a timesheet and shows confirmation", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockGetCurrentUser.mockResolvedValue({
      key: "cuongph@runsystem.net",
      name: "cuongph@runsystem.net",
      displayName: "Phan Hùng Cường",
    });
    mockActOn.mockResolvedValue(undefined);

    const result = await handleActOnTimesheetApproval(
      { userKey: "lapdq@runsystem.net", periodDateFrom: "2026-04-20", action: "approve", comment: "ok" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("✅");
    expect(text).toContain("Approv");
    expect(text).toContain("lapdq@runsystem.net");
    expect(text).toContain("Phan Hùng Cường");
    expect(mockActOn).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey: "lapdq@runsystem.net",
        action: "approve",
        reviewerKey: "cuongph@runsystem.net",
      })
    );
  });

  it("rejects a timesheet and shows ❌ emoji", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockGetCurrentUser.mockResolvedValue({
      key: "cuongph@runsystem.net",
      name: "cuongph@runsystem.net",
      displayName: "Phan Hùng Cường",
    });
    mockActOn.mockResolvedValue(undefined);

    const result = await handleActOnTimesheetApproval(
      { userKey: "lapdq@runsystem.net", periodDateFrom: "2026-04-20", action: "reject", comment: "" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("❌");
    expect(result.content[0].text).toContain("reject");
  });

  it("returns validation error for bad input", async () => {
    const result = await handleActOnTimesheetApproval(
      { userKey: "", periodDateFrom: "bad", action: "approve" },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
