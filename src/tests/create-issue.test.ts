import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import * as sessionManager from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { CUSTOM_FIELD, FIELD, ISSUE_TYPE } from "../jira/constants.js";
import {
  buildCreateIssuePayload,
  validateCreateIssueFields,
} from "../jira/create-issue.js";
import { handleCreateIssue } from "../tools/create-issue.js";

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        get: vi.fn(),
        post: vi.fn(),
      })),
    },
  };
});

describe("validateCreateIssueFields", () => {
  it("accepts a Task payload with required fields only", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.TASK, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Implement MCP create tool",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      })
    ).not.toThrow();
  });

  it("rejects a Bug payload when required fields are missing", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.BUG, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Production defect",
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      })
    ).toThrow(/customfield_10335, customfield_10323/);
  });

  it("allows extra fields not in the DNIEM allowlist (Jira will reject if invalid)", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.TASK, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Task carrying a risk-only field",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
        [CUSTOM_FIELD.RISK_OWNER]: { name: "Alice Smith" },
      })
    ).not.toThrow();
  });
});

describe("buildCreateIssuePayload", () => {
  it("injects issuetype.id from the selected issueTypeId", () => {
    const payload = buildCreateIssuePayload(ISSUE_TYPE.BUG, {
      [FIELD.PROJECT]: { key: "DNIEM" },
      [FIELD.SUMMARY]: "Prod bug",
      [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
      [CUSTOM_FIELD.DEGRADE]: { id: "10000" },
      [FIELD.DUE_DATE]: "2026-04-30",
      [CUSTOM_FIELD.DEFECT_TYPE]: { id: "10100" },
    });

    expect(payload.fields[FIELD.ISSUE_TYPE]).toEqual({ id: ISSUE_TYPE.BUG });
  });

  it("passes a string description through unchanged (no ADF conversion)", () => {
    const payload = buildCreateIssuePayload(ISSUE_TYPE.TASK, {
      [FIELD.PROJECT]: { key: "DNIEM" },
      [FIELD.SUMMARY]: "Task with plain text description",
      [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
      [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
      [FIELD.DUE_DATE]: "2026-04-30",
      [FIELD.DESCRIPTION]: "Line 1\nLine 2",
    });

    expect(payload.fields[FIELD.DESCRIPTION]).toBe("Line 1\nLine 2");
  });

  it("rejects a non-string description", () => {
    expect(() =>
      buildCreateIssuePayload(ISSUE_TYPE.TASK, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Task with invalid description",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
        [FIELD.DESCRIPTION]: 123,
      })
    ).toThrow(/description must be a plain text string/i);
  });

  it("accepts an ADF object as description (tool layer normalizes before calling this)", () => {
    const adfDescription = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Already structured" }] }],
    };
    const payload = buildCreateIssuePayload(ISSUE_TYPE.TASK, {
      [FIELD.PROJECT]: { key: "DNIEM" },
      [FIELD.SUMMARY]: "Task with ADF description",
      [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
      [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
      [FIELD.DUE_DATE]: "2026-04-30",
      [FIELD.DESCRIPTION]: adfDescription,
    });
    expect(payload.fields[FIELD.DESCRIPTION]).toEqual(adfDescription);
  });
});

describe("JiraHttpClient.createIssue", () => {
  const BASE_URL = "https://jira.example.com";
  const cookies = { cookieHeader: "JSESSIONID=abc" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the created issue key and browser URL", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { id: "10001", key: "DNIEM-42" },
    });

    const created = await client.createIssue({
      fields: { project: { key: "DNIEM" }, summary: "Create tool" },
    });

    expect(created).toEqual({
      id: "10001",
      key: "DNIEM-42",
      url: `${BASE_URL}/browse/DNIEM-42`,
    });
  });

  it("treats Jira redirects as expired session during create", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 302,
      data: "<html>login</html>",
    });

    await expect(
      client.createIssue({ fields: { project: { key: "DNIEM" }, summary: "Create tool" } })
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});

describe("handleCreateIssue", () => {
  const mockConfig = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats the created issue response", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "createIssue").mockResolvedValue({
      id: "10001",
      key: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    const result = await handleCreateIssue(
      {
        issueTypeId: ISSUE_TYPE.TASK,
        fields: {
          [FIELD.PROJECT]: { key: "DNIEM" },
          [FIELD.SUMMARY]: "Create MCP tool",
          [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
          [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
          [FIELD.DUE_DATE]: "2026-04-30",
        },
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Created issue DNIEM-42");
    expect(result.content[0].text).toContain("Task");
  });
});
