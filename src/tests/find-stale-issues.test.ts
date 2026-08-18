import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpError } from "../errors.js";
import {
  buildFindStaleIssuesJql,
  findStaleIssuesSchema,
  handleFindStaleIssues,
} from "../tools/find-stale-issues.js";

const { mockLoadSession, mockSearchIssues } = vi.hoisted(() => ({
  mockLoadSession: vi.fn(),
  mockSearchIssues: vi.fn(),
}));

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: mockLoadSession,
}));

vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: class {
    searchIssues = mockSearchIssues;
  },
}));

const config = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself",
} as never;

describe("findStaleIssuesSchema", () => {
  it("applies defaults", () => {
    const result = findStaleIssuesSchema.parse({});
    expect(result).toMatchObject({ staleDays: 30, limit: 10, startAt: 0 });
  });

  it("rejects invalid bounds and project keys", () => {
    expect(findStaleIssuesSchema.safeParse({ staleDays: 0 }).success).toBe(false);
    expect(findStaleIssuesSchema.safeParse({ staleDays: 3651 }).success).toBe(false);
    expect(findStaleIssuesSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(findStaleIssuesSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(findStaleIssuesSchema.safeParse({ project: "bad-key" }).success).toBe(false);
  });
});

describe("buildFindStaleIssuesJql", () => {
  it("builds the base stale query", () => {
    expect(buildFindStaleIssuesJql({ staleDays: 30, limit: 10, startAt: 0 })).toBe(
      'updated <= -30d AND status NOT IN ("Cancel", "Closed") ORDER BY updated ASC',
    );
  });

  it("supports project, status, and assignee filters", () => {
    expect(buildFindStaleIssuesJql({
      staleDays: 60,
      project: "PROJ",
      status: "In Progress",
      assignee: "alice@example.com",
      limit: 10,
      startAt: 0,
    })).toBe(
      'updated <= -60d AND status NOT IN ("Cancel", "Closed") AND project = PROJ AND status = "In Progress" AND assignee = "alice@example.com" ORDER BY updated ASC',
    );
    expect(buildFindStaleIssuesJql({ staleDays: 7, assignee: "me", limit: 10, startAt: 0 })).toContain("assignee = currentUser()");
    expect(buildFindStaleIssuesJql({ staleDays: 7, assignee: "unassigned", limit: 10, startAt: 0 })).toContain("assignee is EMPTY");
  });
});

describe("handleFindStaleIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({ cookieHeader: "sid=abc" });
    mockSearchIssues.mockResolvedValue({ total: 3, issues: [
      {
        key: "PROJ-1", summary: "Old issue", issueType: "Task", status: "Open",
        priority: "High", assignee: null, created: "2026-01-01", updated: "2026-02-01",
        url: "https://jira.example.com/browse/PROJ-1",
      },
    ] });
  });

  it("rejects excluded statuses", async () => {
    const result = await handleFindStaleIssues({ status: "closed" }, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("INVALID_INPUT");
    expect(mockSearchIssues).not.toHaveBeenCalled();
  });

  it("searches with pagination and formats compact output", async () => {
    const result = await handleFindStaleIssues({ staleDays: 45, project: "PROJ", limit: 1, startAt: 1 }, config);
    expect(mockSearchIssues).toHaveBeenCalledWith(
      'updated <= -45d AND status NOT IN ("Cancel", "Closed") AND project = PROJ ORDER BY updated ASC',
      1,
      1,
    );
    expect(result.content[0]?.text).toContain("PROJ-1");
    expect(result.content[0]?.text).toContain("jira_find_stale_issues");
  });

  it("returns authentication errors", async () => {
    mockLoadSession.mockRejectedValue(new McpError("AUTH_REQUIRED", "No session"));
    const result = await handleFindStaleIssues({}, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("AUTH_REQUIRED");
  });

  it("returns Jira errors", async () => {
    mockSearchIssues.mockRejectedValue(new McpError("JIRA_HTTP_ERROR", "Jira unavailable"));
    const result = await handleFindStaleIssues({}, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("JIRA_HTTP_ERROR");
  });

  it("formats an empty result", async () => {
    mockSearchIssues.mockResolvedValue({ total: 0, issues: [] });
    const result = await handleFindStaleIssues({}, config);
    expect(result.content[0]?.text).toContain("No stale issues matched");
    expect(result.content[0]?.text).toContain("jira_get_issue");
  });
});
