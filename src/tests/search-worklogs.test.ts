import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchWorklogsSchema, handleSearchWorklogs } from "../tools/search-worklogs.js";
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
    searchWorklogs: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("searchWorklogsSchema", () => {
  it("accepts valid input with multiple workers", () => {
    expect(
      searchWorklogsSchema.safeParse({
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
        workers: ["ducnpp@runsystem.net", "quocpa@runsystem.net"],
      }).success
    ).toBe(true);
  });

  it("rejects empty workers array", () => {
    expect(
      searchWorklogsSchema.safeParse({
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
        workers: [],
      }).success
    ).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(
      searchWorklogsSchema.safeParse({
        dateFrom: "20/04/2026",
        dateTo: "2026-04-26",
        workers: ["user@example.com"],
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleSearchWorklogs", () => {
  let mockSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      searchWorklogs: mockSearch,
    }) as any);
  });

  it("formats worklogs in a table", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockSearch.mockResolvedValue([
      {
        tempoWorklogId: 12345,
        issueKey: "GENS-100",
        issueSummary: "Fix login bug",
        timeSpent: "4h",
        timeSpentSeconds: 14400,
        startDate: "2026-04-22",
        comment: "Fixed the issue",
        process: "Development",
        typeOfWork: "Bug Fix",
      },
    ]);

    const result = await handleSearchWorklogs(
      { dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["ducnpp@runsystem.net"] },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("GENS-100");
    expect(text).toContain("4h");
    expect(text).toContain("Development");
    expect(text).toContain("Bug Fix");
    expect(text).toContain("**Total entries:** 1");
  });

  it("shows empty message when no worklogs found", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockSearch.mockResolvedValue([]);

    const result = await handleSearchWorklogs(
      { dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["nobody@example.com"] },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No worklogs found");
  });

  it("sums total hours correctly", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockSearch.mockResolvedValue([
      { tempoWorklogId: 1, issueKey: "A-1", issueSummary: null, timeSpent: "2h", timeSpentSeconds: 7200, startDate: "2026-04-20", comment: null, process: null, typeOfWork: null },
      { tempoWorklogId: 2, issueKey: "A-2", issueSummary: null, timeSpent: "3h", timeSpentSeconds: 10800, startDate: "2026-04-21", comment: null, process: null, typeOfWork: null },
    ]);

    const result = await handleSearchWorklogs(
      { dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["user@example.com"] },
      mockConfig
    );

    expect(result.content[0].text).toContain("5.00h"); // 18000s / 3600
    expect(result.content[0].text).toContain("**Total entries:** 2");
  });

  it("returns validation error for bad input", async () => {
    const result = await handleSearchWorklogs({ dateFrom: "bad", dateTo: "also-bad", workers: [] }, mockConfig);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
