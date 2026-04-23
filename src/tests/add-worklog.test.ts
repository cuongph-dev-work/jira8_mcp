import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseDuration, addWorklogSchema } from "../tools/add-worklog.js";

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(7200);
    expect(parseDuration("1h")).toBe(3600);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(1800);
    expect(parseDuration("15m")).toBe(900);
  });

  it("parses days (1d = 8h)", () => {
    expect(parseDuration("1d")).toBe(28800);
    expect(parseDuration("2d")).toBe(57600);
  });

  it("parses combined durations", () => {
    expect(parseDuration("1d 2h")).toBe(28800 + 7200); // 36000
    expect(parseDuration("1d 4h 30m")).toBe(28800 + 14400 + 1800); // 45000
    expect(parseDuration("2h 30m")).toBe(7200 + 1800); // 9000
  });

  it("is case-insensitive", () => {
    expect(parseDuration("2H 30M")).toBe(9000);
    expect(parseDuration("1D")).toBe(28800);
  });

  it("handles extra whitespace", () => {
    expect(parseDuration("  2h   30m  ")).toBe(9000);
  });

  it("supports decimal values", () => {
    expect(parseDuration("1.5h")).toBe(5400);
    expect(parseDuration("0.5d")).toBe(14400); // 4h
  });

  it("throws on empty string", () => {
    expect(() => parseDuration("")).toThrow("empty");
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration");
    expect(() => parseDuration("2x")).toThrow("Invalid duration");
    expect(() => parseDuration("hello world")).toThrow("Invalid duration");
  });

  it("throws on zero duration", () => {
    expect(() => parseDuration("0h")).toThrow("greater than zero");
    expect(() => parseDuration("0m")).toThrow("greater than zero");
  });
});

// ---------------------------------------------------------------------------
// addWorklogSchema
// ---------------------------------------------------------------------------

describe("addWorklogSchema", () => {
  const validInput = {
    issueKey: "PROJ-123",
    timeSpent: "2h",
    startDate: "2026-04-24",
  };

  it("accepts valid minimal input", () => {
    const result = addWorklogSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts full input with optional fields", () => {
    const result = addWorklogSchema.safeParse({
      ...validInput,
      comment: "Fixed a bug",
      includeNonWorkingDays: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults includeNonWorkingDays to false", () => {
    const result = addWorklogSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeNonWorkingDays).toBe(false);
    }
  });

  it("rejects empty issueKey", () => {
    const result = addWorklogSchema.safeParse({ ...validInput, issueKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects lowercase issueKey", () => {
    const result = addWorklogSchema.safeParse({ ...validInput, issueKey: "proj-123" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = addWorklogSchema.safeParse({ ...validInput, startDate: "24/04/2026" });
    expect(result.success).toBe(false);
  });

  it("rejects empty timeSpent", () => {
    const result = addWorklogSchema.safeParse({ ...validInput, timeSpent: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing issueKey", () => {
    const { issueKey, ...rest } = validInput;
    const result = addWorklogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleAddWorklog — session guard
// ---------------------------------------------------------------------------

describe("handleAddWorklog — session guard", () => {
  vi.mock("../auth/session-manager.js", () => {
    return {
      loadAndValidateSession: vi.fn().mockImplementation(async () => {
        const { McpError } = await import("../errors.js");
        throw new McpError("AUTH_REQUIRED", "No session found. Run `jira-auth-login`.");
      }),
      extractCookies: vi.fn(),
    };
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it("returns auth error content when session is missing", async () => {
    const { handleAddWorklog } = await import("../tools/add-worklog.js");
    const mockConfig = {
      JIRA_BASE_URL: "https://jira.example.com",
      JIRA_SESSION_FILE: ".jira/session.json",
      JIRA_VALIDATE_PATH: "/rest/api/2/myself",
      MCP_PORT: 3000,
      LOG_LEVEL: "info",
      PLAYWRIGHT_HEADLESS: false,
      PLAYWRIGHT_BROWSER: "chromium",
    };

    const result = await handleAddWorklog(
      { issueKey: "PROJ-1", timeSpent: "2h", startDate: "2026-04-24" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("AUTH_REQUIRED");
  });

  it("returns error for invalid duration in input", async () => {
    const { handleAddWorklog } = await import("../tools/add-worklog.js");
    const mockConfig = {
      JIRA_BASE_URL: "https://jira.example.com",
      JIRA_SESSION_FILE: ".jira/session.json",
      JIRA_VALIDATE_PATH: "/rest/api/2/myself",
      MCP_PORT: 3000,
      LOG_LEVEL: "info",
      PLAYWRIGHT_HEADLESS: false,
      PLAYWRIGHT_BROWSER: "chromium",
    };

    const result = await handleAddWorklog(
      { issueKey: "PROJ-1", timeSpent: "abc", startDate: "2026-04-24" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("Invalid duration");
  });
});
