import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportProjectTimesheetSchema,
  handleExportProjectTimesheet,
} from "../tools/export-project-timesheet.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { McpError } from "../errors.js";
import { mkdir, writeFile } from "node:fs/promises";

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself" as const,
  ATTACHMENT_WORKSPACE: "/tmp/jira-downloads",
  LOG_LEVEL: "info" as const,
  PLAYWRIGHT_HEADLESS: false as const,
  PLAYWRIGHT_BROWSER: "chromium" as const,
};

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: vi.fn().mockImplementation(() => ({
    exportProjectTimesheet: vi.fn(),
    getProjects: vi.fn(),
  })),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("exportProjectTimesheetSchema", () => {
  it("accepts valid input and defaults format to xlsx", () => {
    const result = exportProjectTimesheetSchema.safeParse({
      projectKey: "ME",
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe("xlsx");
  });

  it("rejects empty projectKey", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "",
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
      }).success
    ).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "ME",
        dateFrom: "20/04/2026",
        dateTo: "2026-04-26",
      }).success
    ).toBe(false);
  });

  it("rejects an unsupported format value", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "ME",
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
        format: "pdf",
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleExportProjectTimesheet", () => {
  let mockExport: ReturnType<typeof vi.fn>;
  let mockGetProjects: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExport = vi.fn();
    mockGetProjects = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      exportProjectTimesheet: mockExport,
      getProjects: mockGetProjects,
    }) as any);
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
  });

  it("writes the exported file to ATTACHMENT_WORKSPACE and reports its path", async () => {
    mockGetProjects.mockResolvedValue([
      {
        id: "10000",
        key: "ME",
        name: "Microcopy E-learning System",
        url: "https://jira.example.com/projects/ME",
      },
    ]);
    mockExport.mockResolvedValue({
      buffer: Buffer.from("xlsx-bytes"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentDisposition: undefined,
    });

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(mockExport).toHaveBeenCalledWith({
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
      projectKey: "ME",
      title: "Project: Microcopy E-learning System (ME)",
      format: "xlsx",
    });
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith("/tmp/jira-downloads", { recursive: true });
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("timesheet_ME_2026-04-20_to_2026-04-26_"),
      expect.any(Buffer)
    );
    const text = result.content[0].text;
    expect(text).toContain("ME");
    expect(text).toContain("2026-04-20");
    expect(text).toContain(".xlsx");
  });

  it("falls back to a generic title when the project lookup fails", async () => {
    mockGetProjects.mockRejectedValue(new Error("network error"));
    mockExport.mockResolvedValue({ buffer: Buffer.from("bytes"), contentType: "text/csv" });

    const result = await handleExportProjectTimesheet(
      { projectKey: "ZZZ", dateFrom: "2026-04-20", dateTo: "2026-04-26", format: "csv" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(mockExport).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Project: ZZZ" })
    );
  });

  it("surfaces filter-id-parse failures with the raw payload visible", async () => {
    mockGetProjects.mockResolvedValue([]);
    mockExport.mockRejectedValue(
      new McpError("JIRA_RESPONSE_ERROR", "Unexpected Tempo export filter response shape", {
        unexpected: "shape",
      })
    );

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("JIRA_RESPONSE_ERROR");
  });

  it("surfaces auth errors with isError true", async () => {
    vi.mocked(loadAndValidateSession).mockRejectedValue(
      new McpError("SESSION_EXPIRED", "Auth failed")
    );

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SESSION_EXPIRED");
  });

  it("returns validation error for bad input", async () => {
    const result = await handleExportProjectTimesheet(
      { projectKey: "", dateFrom: "bad", dateTo: "bad" },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
