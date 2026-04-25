import { describe, it, expect, vi, beforeEach } from "vitest";
import { CUSTOM_FIELD, FIELD, ISSUE_TYPE } from "../jira/constants.js";
import { createIssueSchema } from "../tools/create-issue.js";
import { getIssueSchema } from "../tools/get-issue.js";
import { searchIssuesSchema as searchSchema } from "../tools/search-issues.js";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("getIssueSchema", () => {
  it("accepts a valid issue key", () => {
    expect(getIssueSchema.safeParse({ issueKey: "PROJ-123" }).success).toBe(true);
    expect(getIssueSchema.safeParse({ issueKey: "AB-1" }).success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(getIssueSchema.safeParse({ issueKey: "" }).success).toBe(false);
  });

  it("rejects lowercase key", () => {
    expect(getIssueSchema.safeParse({ issueKey: "proj-123" }).success).toBe(false);
  });

  it("rejects key without number", () => {
    expect(getIssueSchema.safeParse({ issueKey: "PROJ" }).success).toBe(false);
  });
});

describe("searchIssuesSchema", () => {
  it("accepts a valid JQL query with default limit", () => {
    const result = searchSchema.safeParse({ jql: "project = PROJ" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it("accepts a custom limit within range", () => {
    const result = searchSchema.safeParse({ jql: "project = PROJ", limit: 25 });
    expect(result.success).toBe(true);
  });

  it("rejects limit above 50", () => {
    const result = searchSchema.safeParse({ jql: "project = PROJ", limit: 51 });
    expect(result.success).toBe(false);
  });

  it("rejects limit of 0", () => {
    const result = searchSchema.safeParse({ jql: "project = PROJ", limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects empty JQL", () => {
    const result = searchSchema.safeParse({ jql: "" });
    expect(result.success).toBe(false);
  });
});

describe("createIssueSchema", () => {
  it("accepts a valid create request", () => {
    const result = createIssueSchema.safeParse({
      issueTypeId: ISSUE_TYPE.TASK,
      fields: {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Create MCP tool",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported issueTypeId", () => {
    const result = createIssueSchema.safeParse({
      issueTypeId: "99999",
      fields: {},
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tool handler integration (mocked)
// ---------------------------------------------------------------------------

describe("handleGetIssue — session guard", () => {
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
    const { handleGetIssue } = await import("../tools/get-issue.js");
    const mockConfig = {
      JIRA_BASE_URL: "https://jira.example.com",
      JIRA_SESSION_FILE: ".jira/session.json",
      JIRA_VALIDATE_PATH: "/rest/api/2/myself",
      LOG_LEVEL: "info",
      PLAYWRIGHT_HEADLESS: false,
      PLAYWRIGHT_BROWSER: "chromium",
    };

    const result = await handleGetIssue({ issueKey: "PROJ-1" }, mockConfig as never);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("AUTH_REQUIRED");
  });
});
