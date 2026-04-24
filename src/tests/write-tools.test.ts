import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPONENT,
  CUSTOM_FIELD,
  FIELD,
  ISSUE_TYPE,
} from "../jira/constants.js";
import {
  buildCreateMeta,
  getKnownFieldOptions,
} from "../jira/create-meta.js";
import { handleAddComment } from "../tools/add-comment.js";
import { handleAssignIssue } from "../tools/assign-issue.js";
import { handleGetCreateMeta } from "../tools/get-create-meta.js";
import { handleGetMyWorklogs } from "../tools/get-my-worklogs.js";
import { handleGetTransitions } from "../tools/get-transitions.js";
import { handleLinkIssues } from "../tools/link-issues.js";
import { handleTransitionIssue } from "../tools/transition-issue.js";
import { handleUpdateIssueFields } from "../tools/update-issue-fields.js";
import {
  buildUpdateIssuePayload,
  UPDATEABLE_FIELDS,
} from "../jira/update-issue.js";
import {
  buildMinimalAdfDocument,
  normalizeAdfValue,
} from "../jira/adf.js";
import * as sessionManager from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

describe("ADF helpers", () => {
  it("converts a string to a minimal ADF document", () => {
    expect(normalizeAdfValue("Hello Jira")).toEqual(buildMinimalAdfDocument("Hello Jira"));
  });

  it("keeps a valid ADF document unchanged", () => {
    const adf = buildMinimalAdfDocument("Already structured");
    expect(normalizeAdfValue(adf)).toEqual(adf);
  });

  it("rejects invalid ADF input", () => {
    expect(() => normalizeAdfValue(123)).toThrow(/must be a string or a valid ADF document/i);
  });
});

describe("update issue helpers", () => {
  it("exposes a curated allowlist for safe updates", () => {
    expect(UPDATEABLE_FIELDS).toContain(FIELD.SUMMARY);
    expect(UPDATEABLE_FIELDS).toContain(FIELD.DESCRIPTION);
    expect(UPDATEABLE_FIELDS).not.toContain(FIELD.PROJECT);
  });

  it("builds an update payload and normalizes description to ADF", () => {
    const payload = buildUpdateIssuePayload({
      [FIELD.SUMMARY]: "Updated summary",
      [FIELD.DESCRIPTION]: "Updated description",
      [FIELD.COMPONENTS]: [{ id: COMPONENT.QA }],
    });

    expect(payload).toEqual({
      fields: {
        [FIELD.SUMMARY]: "Updated summary",
        [FIELD.DESCRIPTION]: buildMinimalAdfDocument("Updated description"),
        [FIELD.COMPONENTS]: [{ id: COMPONENT.QA }],
      },
    });
  });

  it("rejects unsupported update fields", () => {
    expect(() =>
      buildUpdateIssuePayload({
        [FIELD.PROJECT]: { key: "DNIEM" },
      })
    ).toThrow(/unsupported fields/i);
  });
});

describe("create meta helpers", () => {
  it("returns full metadata for all issue types", () => {
    const meta = buildCreateMeta();
    expect(meta.issueTypes.length).toBeGreaterThan(5);
    expect(meta.issueTypes.some((it) => it.id === ISSUE_TYPE.TASK)).toBe(true);
  });

  it("returns a single issue type slice when requested", () => {
    const meta = buildCreateMeta(ISSUE_TYPE.TASK);
    expect(meta.issueTypes).toHaveLength(1);
    expect(meta.issueTypes[0]?.id).toBe(ISSUE_TYPE.TASK);
    expect(meta.issueTypes[0]?.requiredFields).toContain(CUSTOM_FIELD.DIFFICULTY_LEVEL);
  });

  it("exposes known field option maps for supported fields", () => {
    const options = getKnownFieldOptions();
    expect(options[CUSTOM_FIELD.PROJECT_STAGES]?.["CODING"]).toBeDefined();
    expect(options[FIELD.COMPONENTS]?.["QA"]).toBe(COMPONENT.QA);
  });
});

describe("transition/comment tool handlers", () => {
  const mockConfig = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    MCP_PORT: 3000,
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats add comment results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "addComment").mockResolvedValue({
      id: "10001",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    const result = await handleAddComment(
      { issueKey: "DNIEM-42", body: "Investigating now" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Comment added");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("formats transition results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "transitionIssue").mockResolvedValue(undefined);

    const result = await handleTransitionIssue(
      { issueKey: "DNIEM-42", transitionId: "31", comment: "Done" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Transition applied");
    expect(result.content[0].text).toContain("31");
  });

  it("formats create meta results", async () => {
    const result = await handleGetCreateMeta({ issueTypeId: ISSUE_TYPE.TASK });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Task");
    expect(result.content[0].text).toContain(CUSTOM_FIELD.DIFFICULTY_LEVEL);
  });

  it("formats update issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "updateIssueFields").mockResolvedValue(undefined);

    const result = await handleUpdateIssueFields(
      {
        issueKey: "DNIEM-42",
        fields: {
          [FIELD.SUMMARY]: "Updated summary",
          [FIELD.DESCRIPTION]: "Updated description",
        },
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Issue updated");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("formats get transitions results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getTransitions").mockResolvedValue([
      { id: "11", name: "Start Progress", toStatus: "In Progress" },
    ]);

    const result = await handleGetTransitions(
      { issueKey: "DNIEM-42" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Start Progress");
  });

  it("formats link issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "linkIssues").mockResolvedValue({
      linkId: "20001",
    });

    const result = await handleLinkIssues(
      {
        inwardIssueKey: "DNIEM-42",
        outwardIssueKey: "DNIEM-43",
        linkType: "Blocks",
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Link created");
  });

  it("formats assign issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "assignIssue").mockResolvedValue(undefined);

    const result = await handleAssignIssue(
      { issueKey: "DNIEM-42", assigneeName: "alice" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Issue assigned");
  });

  it("formats my worklogs results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getCurrentUser").mockResolvedValue({
      key: "alice",
      name: "alice",
      displayName: "Alice",
    });
    vi.spyOn(JiraHttpClient.prototype, "getMyWorklogs").mockResolvedValue([
      {
        tempoWorklogId: 30001,
        issueKey: "DNIEM-42",
        timeSpent: "2h",
        timeSpentSeconds: 7200,
        startDate: "2026-04-24",
        comment: "Implementation",
      },
    ]);

    const result = await handleGetMyWorklogs(
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Alice");
    expect(result.content[0].text).toContain("DNIEM-42");
  });
});
