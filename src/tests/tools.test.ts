import { describe, it, expect, vi, beforeEach } from "vitest";
import { CUSTOM_FIELD, FIELD, ISSUE_TYPE } from "../jira/constants.js";
import { createIssueSchema } from "../tools/create-issue.js";
import { getIssueSchema } from "../tools/get-issue.js";
import { getIssueContextSchema } from "../tools/get-issue-context.js";
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

// ---------------------------------------------------------------------------
// getIssueContextSchema
// ---------------------------------------------------------------------------

describe("getIssueContextSchema", () => {
  it("accepts a valid issue key with defaults", () => {
    const result = getIssueContextSchema.safeParse({ issueKey: "PROJ-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDescriptionLength).toBe(500);
      expect(result.data.includeComments).toBe(false);
      expect(result.data.includeHints).toBe(false);
      expect(result.data.maxComments).toBe(5);
    }
  });

  it("accepts maxDescriptionLength = 0 to omit description", () => {
    const result = getIssueContextSchema.safeParse({ issueKey: "AB-1", maxDescriptionLength: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts maxDescriptionLength at upper bound (2000)", () => {
    const result = getIssueContextSchema.safeParse({ issueKey: "AB-1", maxDescriptionLength: 2000 });
    expect(result.success).toBe(true);
  });

  it("rejects maxDescriptionLength above 2000", () => {
    const result = getIssueContextSchema.safeParse({ issueKey: "AB-1", maxDescriptionLength: 2001 });
    expect(result.success).toBe(false);
  });

  it("rejects lowercase issue key", () => {
    expect(getIssueContextSchema.safeParse({ issueKey: "proj-123" }).success).toBe(false);
  });

  it("rejects empty issueKey", () => {
    expect(getIssueContextSchema.safeParse({ issueKey: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleGetIssueContext — session guard
// ---------------------------------------------------------------------------

describe("handleGetIssueContext — session guard", () => {
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
    const { handleGetIssueContext } = await import("../tools/get-issue-context.js");
    const mockConfig = {
      JIRA_BASE_URL: "https://jira.example.com",
      JIRA_SESSION_FILE: ".jira/session.json",
      JIRA_VALIDATE_PATH: "/rest/api/2/myself",
      LOG_LEVEL: "info",
      PLAYWRIGHT_HEADLESS: false,
      PLAYWRIGHT_BROWSER: "chromium",
    };

    const result = await handleGetIssueContext({ issueKey: "PROJ-1" }, mockConfig as never);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("AUTH_REQUIRED");
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatCompact — behavioral tests
// ---------------------------------------------------------------------------

import { formatCompact } from "../tools/get-issue-context.js";
import type { JiraIssue, JiraComment } from "../types.js";

/** Minimal JiraIssue stub — only fields the formatter touches */
function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: "PROJ-42",
    summary: "Test issue",
    url: "https://jira.example.com/browse/PROJ-42",
    issueType: "Bug",
    status: "In Progress",
    resolution: null,
    priority: "High",
    labels: [],
    components: [],
    affectsVersions: [],
    fixVersions: [],
    assignee: "John Doe",
    reporter: "Jane Smith",
    defectOwner: null,
    created: "2026-04-12T10:00:00.000Z",
    updated: "2026-04-27T08:00:00.000Z",
    dueDate: null,
    planStartDate: null,
    actualStartDate: null,
    actualEndDate: null,
    timeTracking: { originalEstimate: null, remainingEstimate: null, timeSpent: null },
    epicLink: null,
    epicName: null,
    parent: null,
    subtasks: [],
    projectStages: null,
    defectType: null,
    defectOrigin: null,
    causeCategory: null,
    severity: null,
    degrade: null,
    impactAssessment: null,
    causeAnalysis: null,
    action: null,
    dod: null,
    attachments: [],
    description: null,
    ...overrides,
  };
}

const noComments: JiraComment[] = [];
const baseOpts = { maxDescriptionLength: 500, includeComments: false, includeHints: false };

describe("formatCompact — description handling", () => {
  it("omits description section when maxDescriptionLength=0", () => {
    const issue = makeIssue({ description: "Some description text" });
    const out = formatCompact(issue, noComments, { ...baseOpts, maxDescriptionLength: 0 });
    expect(out).not.toContain("Description");
    expect(out).not.toContain("Some description");
  });

  it("includes full description when shorter than limit", () => {
    const issue = makeIssue({ description: "Short desc" });
    const out = formatCompact(issue, noComments, { ...baseOpts, maxDescriptionLength: 500 });
    expect(out).toContain("Description:");
    expect(out).toContain("Short desc");
    expect(out).not.toContain("…");
  });

  it("truncates description with ellipsis when over limit", () => {
    const longDesc = "A".repeat(600);
    const issue = makeIssue({ description: longDesc });
    const out = formatCompact(issue, noComments, { ...baseOpts, maxDescriptionLength: 100 });
    expect(out).toContain("Description (first 100 chars):");
    expect(out).toContain("A".repeat(100) + "…");
    // Must NOT include characters beyond the limit
    expect(out).not.toContain("A".repeat(101));
  });

  it("omits description section when description is null", () => {
    const issue = makeIssue({ description: null });
    const out = formatCompact(issue, noComments, baseOpts);
    expect(out).not.toContain("Description");
  });
});

describe("formatCompact — comments section", () => {
  const comments: JiraComment[] = [
    { id: "101", author: "Alice", body: "This is a clarification", created: "2026-04-20T09:00:00.000Z", updated: "2026-04-20T09:00:00.000Z" },
    { id: "102", author: "Bob", body: "Another note", created: "2026-04-21T10:00:00.000Z", updated: "2026-04-21T10:00:00.000Z" },
  ];

  it("omits comments section when includeComments=false", () => {
    const out = formatCompact(makeIssue(), comments, { ...baseOpts, includeComments: false });
    expect(out).not.toContain("Recent Comments");
    expect(out).not.toContain("Alice");
  });

  it("includes compact comment lines when includeComments=true", () => {
    const out = formatCompact(makeIssue(), comments, { ...baseOpts, includeComments: true });
    expect(out).toContain("Recent Comments (2):");
    expect(out).toContain("[101] Alice");
    expect(out).toContain("This is a clarification");
    expect(out).toContain("[102] Bob");
  });

  it("truncates long comment body to 200 chars with ellipsis", () => {
    const longBody = "B".repeat(250);
    const longComments: JiraComment[] = [
      { id: "200", author: "Carol", body: longBody, created: "2026-04-22T00:00:00.000Z", updated: "2026-04-22T00:00:00.000Z" },
    ];
    const out = formatCompact(makeIssue(), longComments, { ...baseOpts, includeComments: true });
    expect(out).toContain("B".repeat(200) + "…");
    expect(out).not.toContain("B".repeat(201));
  });
});

describe("formatCompact — navigation hints", () => {
  it("omits hints by default (includeHints=false)", () => {
    const out = formatCompact(makeIssue(), noComments, { ...baseOpts, includeHints: false });
    expect(out).not.toContain("💡 **Next:**");
  });

  it("includes hints when includeHints=true", () => {
    const out = formatCompact(makeIssue(), noComments, { ...baseOpts, includeHints: true });
    expect(out).toContain("💡 **Next:**");
    expect(out).toContain("jira_get_issue");
  });
});
