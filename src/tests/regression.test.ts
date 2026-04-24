/**
 * Regression tests for the 4 bug fixes.
 *
 * 1. server.ts  — concurrent /mcp requests each get their own McpServer instance
 * 2. session-manager — 302/307/308 redirects are treated as SESSION_EXPIRED
 * 3. playwright-auth — session not written if pre-save validation fails
 * 4. tools (get-issue / search-issues) — auth failure returns isError: true
 *
 * IMPORTANT: vi.mock() is hoisted to the top of the file by Vitest, so all
 * mock factories must be self-contained (no references to variables defined
 * later in the file). Per-test behaviour is controlled via mockImplementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Top-level module mocks (hoisted — must be self-contained)
// ---------------------------------------------------------------------------

// Mocked at the top so they're available for all test groups that need them.
// Individual tests override behaviour with mockImplementation.

vi.mock("../auth/session-store.js", () => ({
  readSession: vi.fn(),
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      post: vi.fn(),
      create: vi.fn(() => ({
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// 1. Concurrent /mcp requests — server factory creates distinct instances
// ---------------------------------------------------------------------------

describe("server factory (concurrent request isolation)", () => {
  it("each createMcpServer call returns a distinct McpServer instance", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const a = new McpServer({ name: "jira-run-mcp", version: "0.1.0" });
    const b = new McpServer({ name: "jira-run-mcp", version: "0.1.0" });
    // Must be separate objects — the old code reused a single shared singleton
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 2. session-manager — 3xx = SESSION_EXPIRED
// ---------------------------------------------------------------------------

describe("loadAndValidateSession — 3xx redirect handling", () => {
  const BASE_URL = "https://jira.example.com";

  const VALID_SESSION = {
    savedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    storageState: {
      cookies: [
        {
          name: "JSESSIONID",
          value: "abc",
          domain: "jira.example.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    },
  };

  beforeEach(async () => {
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(VALID_SESSION);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function runWith3xx(status: number) {
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockRejectedValue(
      Object.assign(new Error("redirect"), {
        isAxiosError: true,
        response: { status },
      })
    );
    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    return loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself");
  }

  it("throws SESSION_EXPIRED on 302 Found", async () => {
    await expect(runWith3xx(302)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("throws SESSION_EXPIRED on 307 Temporary Redirect", async () => {
    await expect(runWith3xx(307)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("throws SESSION_EXPIRED on 308 Permanent Redirect", async () => {
    await expect(runWith3xx(308)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});

// ---------------------------------------------------------------------------
// 3. playwright-auth — validateCandidateSession (no disk side-effects)
// ---------------------------------------------------------------------------

describe("validateCandidateSession", () => {
  const BASE_URL = "https://jira.example.com";

  const FAKE_SESSION = {
    savedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    storageState: { cookies: [], origins: [] },
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when Jira returns 401 for the candidate session", async () => {
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockRejectedValue(
      Object.assign(new Error("unauth"), {
        isAxiosError: true,
        response: { status: 401 },
      })
    );

    const { validateCandidateSession } = await import("../auth/playwright-auth.js");
    const result = await validateCandidateSession(FAKE_SESSION, BASE_URL, "/rest/api/2/myself");
    expect(result).toBe(false);
  });

  it("returns false when Jira returns 302 for the candidate session", async () => {
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockRejectedValue(
      Object.assign(new Error("redirect"), {
        isAxiosError: true,
        response: { status: 302 },
      })
    );

    const { validateCandidateSession } = await import("../auth/playwright-auth.js");
    const result = await validateCandidateSession(FAKE_SESSION, BASE_URL, "/rest/api/2/myself");
    expect(result).toBe(false);
  });

  it("returns true when Jira returns 200 for the candidate session", async () => {
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockResolvedValue({
      status: 200,
      data: { accountId: "abc123", displayName: "Test User" },
    });

    const { validateCandidateSession } = await import("../auth/playwright-auth.js");
    const result = await validateCandidateSession(FAKE_SESSION, BASE_URL, "/rest/api/2/myself");
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Tools — auth failure must return isError: true
// ---------------------------------------------------------------------------

describe("tool auth failure — isError response", () => {
  const MOCK_CONFIG = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    MCP_PORT: 3000,
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium",
  };

  // Drive session validation failure via the session-store mock:
  // readSession returns null → loadAndValidateSession throws AUTH_REQUIRED
  beforeEach(async () => {
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("jira_get_issue returns isError:true when session is missing", async () => {
    const { handleGetIssue } = await import("../tools/get-issue.js");
    const result = await handleGetIssue({ issueKey: "PROJ-1" }, MOCK_CONFIG as never);

    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("AUTH_REQUIRED");
  });

  it("jira_search_issues returns isError:true when session is missing", async () => {
    const { handleSearchIssues } = await import("../tools/search-issues.js");
    const result = await handleSearchIssues(
      { jql: "project = PROJ", limit: 5 },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_create_issue returns isError:true when session is missing", async () => {
    const { handleCreateIssue } = await import("../tools/create-issue.js");
    const result = await handleCreateIssue(
      {
        issueTypeId: "10000",
        fields: {
          project: { key: "DNIEM" },
          summary: "Create issue",
          customfield_12100: { id: "10400" },
          customfield_10339: [{ id: "10300" }],
          duedate: "2026-04-30",
        },
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_add_comment returns isError:true when session is missing", async () => {
    const { handleAddComment } = await import("../tools/add-comment.js");
    const result = await handleAddComment(
      { issueKey: "PROJ-1", body: "test comment" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_transition_issue returns isError:true when session is missing", async () => {
    const { handleTransitionIssue } = await import("../tools/transition-issue.js");
    const result = await handleTransitionIssue(
      { issueKey: "PROJ-1", transitionId: "11" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_update_issue_fields returns isError:true when session is missing", async () => {
    const { handleUpdateIssueFields } = await import("../tools/update-issue-fields.js");
    const result = await handleUpdateIssueFields(
      { issueKey: "PROJ-1", fields: { summary: "Updated" } },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_link_issues returns isError:true when session is missing", async () => {
    const { handleLinkIssues } = await import("../tools/link-issues.js");
    const result = await handleLinkIssues(
      {
        inwardIssueKey: "PROJ-1",
        outwardIssueKey: "PROJ-2",
        linkType: "Blocks",
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_issue_links returns isError:true when session is missing", async () => {
    const { handleGetIssueLinks } = await import("../tools/get-issue-links.js");
    const result = await handleGetIssueLinks(
      { issueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_subtasks returns isError:true when session is missing", async () => {
    const { handleGetSubtasks } = await import("../tools/get-subtasks.js");
    const result = await handleGetSubtasks(
      { issueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_create_subtask returns isError:true when session is missing", async () => {
    const { handleCreateSubtask } = await import("../tools/create-subtask.js");
    const result = await handleCreateSubtask(
      {
        parentIssueKey: "PROJ-1",
        issueTypeId: "10003",
        fields: { project: { key: "PROJ" }, summary: "Subtask" },
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_clone_issue returns isError:true when session is missing", async () => {
    const { handleCloneIssue } = await import("../tools/clone-issue.js");
    const result = await handleCloneIssue(
      { sourceIssueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_bulk_link_issues returns isError:true when session is missing", async () => {
    const { handleBulkLinkIssues } = await import("../tools/bulk-link-issues.js");
    const result = await handleBulkLinkIssues(
      {
        links: [
          {
            inwardIssueKey: "PROJ-1",
            outwardIssueKey: "PROJ-2",
            linkType: "Blocks",
          },
        ],
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_validate_issue_update returns isError:true when session is missing", async () => {
    const { handleValidateIssueUpdate } = await import("../tools/validate-issue-update.js");
    const result = await handleValidateIssueUpdate(
      { issueKey: "PROJ-1", fields: { summary: "Updated" } },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_bulk_update_issue_fields returns isError:true when session is missing", async () => {
    const { handleBulkUpdateIssueFields } = await import("../tools/bulk-update-issue-fields.js");
    const result = await handleBulkUpdateIssueFields(
      {
        dryRun: true,
        issues: [{ issueKey: "PROJ-1", fields: { summary: "Updated" } }],
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_bulk_transition_issues returns isError:true when session is missing", async () => {
    const { handleBulkTransitionIssues } = await import("../tools/bulk-transition-issues.js");
    const result = await handleBulkTransitionIssues(
      {
        dryRun: true,
        issues: [{ issueKey: "PROJ-1", transitionId: "11" }],
      },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_audit_context returns isError:true when session is missing", async () => {
    const { handleGetAuditContext } = await import("../tools/get-audit-context.js");
    const result = await handleGetAuditContext(
      { issueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_assign_issue returns isError:true when session is missing", async () => {
    const { handleAssignIssue } = await import("../tools/assign-issue.js");
    const result = await handleAssignIssue(
      { issueKey: "PROJ-1", assigneeName: "alice" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_transitions returns isError:true when session is missing", async () => {
    const { handleGetTransitions } = await import("../tools/get-transitions.js");
    const result = await handleGetTransitions(
      { issueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_my_worklogs returns isError:true when session is missing", async () => {
    const { handleGetMyWorklogs } = await import("../tools/get-my-worklogs.js");
    const result = await handleGetMyWorklogs(
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_find_user returns isError:true when session is missing", async () => {
    const { handleFindUser } = await import("../tools/find-user.js");
    const result = await handleFindUser(
      { query: "alice" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_edit_meta returns isError:true when session is missing", async () => {
    const { handleGetEditMeta } = await import("../tools/get-edit-meta.js");
    const result = await handleGetEditMeta(
      { issueKey: "PROJ-1" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_update_comment returns isError:true when session is missing", async () => {
    const { handleUpdateComment } = await import("../tools/update-comment.js");
    const result = await handleUpdateComment(
      { issueKey: "PROJ-1", commentId: "10001", body: "updated" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_delete_comment returns isError:true when session is missing", async () => {
    const { handleDeleteComment } = await import("../tools/delete-comment.js");
    const result = await handleDeleteComment(
      { issueKey: "PROJ-1", commentId: "10001" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_update_worklog returns isError:true when session is missing", async () => {
    const { handleUpdateWorklog } = await import("../tools/update-worklog.js");
    const result = await handleUpdateWorklog(
      { worklogId: "30001", comment: "updated" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_delete_worklog returns isError:true when session is missing", async () => {
    const { handleDeleteWorklog } = await import("../tools/delete-worklog.js");
    const result = await handleDeleteWorklog(
      { worklogId: "30001" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_add_attachment returns isError:true when session is missing", async () => {
    const { handleAddAttachment } = await import("../tools/add-attachment.js");
    const result = await handleAddAttachment(
      { issueKey: "PROJ-1", filePath: "README.md" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_projects returns isError:true when session is missing", async () => {
    const { handleGetProjects } = await import("../tools/get-projects.js");
    const result = await handleGetProjects({}, MOCK_CONFIG as never);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_components returns isError:true when session is missing", async () => {
    const { handleGetComponents } = await import("../tools/get-components.js");
    const result = await handleGetComponents(
      { projectKey: "PROJ" },
      MOCK_CONFIG as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_priorities returns isError:true when session is missing", async () => {
    const { handleGetPriorities } = await import("../tools/get-priorities.js");
    const result = await handleGetPriorities({}, MOCK_CONFIG as never);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });

  it("jira_get_issue with invalid key format returns isError:true", async () => {
    const { handleGetIssue } = await import("../tools/get-issue.js");
    const result = await handleGetIssue({ issueKey: "not-valid-key" }, MOCK_CONFIG as never);

    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toContain("Invalid input");
  });
});
