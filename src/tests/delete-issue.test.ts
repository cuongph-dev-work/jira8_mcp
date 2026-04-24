import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import * as sessionManager from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { handleDeleteIssue } from "../tools/delete-issue.js";

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
        put: vi.fn(),
        delete: vi.fn(),
      })),
    },
  };
});

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself",
  MCP_PORT: 3000,
  LOG_LEVEL: "info",
  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_BROWSER: "chromium" as const,
};

describe("JiraHttpClient.deleteIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends DELETE with deleteSubtasks=false by default", async () => {
    const client = new JiraHttpClient("https://jira.example.com", { cookieHeader: "JSESSIONID=abc" });
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.delete).mockResolvedValue({ status: 204, data: "" });

    await client.deleteIssue("PROJ-123", false);

    expect(mockedInstance.delete).toHaveBeenCalledWith(
      "https://jira.example.com/rest/api/2/issue/PROJ-123",
      { params: { deleteSubtasks: "false" } }
    );
  });

  it("sends DELETE with deleteSubtasks=true when requested", async () => {
    const client = new JiraHttpClient("https://jira.example.com", { cookieHeader: "JSESSIONID=abc" });
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.delete).mockResolvedValue({ status: 204, data: "" });

    await client.deleteIssue("PROJ-456", true);

    expect(mockedInstance.delete).toHaveBeenCalledWith(
      "https://jira.example.com/rest/api/2/issue/PROJ-456",
      { params: { deleteSubtasks: "true" } }
    );
  });

  it("treats redirects as expired session", async () => {
    const client = new JiraHttpClient("https://jira.example.com", { cookieHeader: "JSESSIONID=abc" });
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.delete).mockResolvedValue({ status: 302, data: "<html>login</html>" });

    await expect(client.deleteIssue("PROJ-123", false)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});

describe("handleDeleteIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid issueKey format", async () => {
    const result = await handleDeleteIssue({ issueKey: "bad-key" }, mockConfig as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });

  it("returns success response with issue key and subtask status", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "deleteIssue").mockResolvedValue(undefined);

    const result = await handleDeleteIssue(
      { issueKey: "PROJ-123", deleteSubtasks: true },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Issue deleted");
    expect(result.content[0].text).toContain("PROJ-123");
    expect(result.content[0].text).toContain("Yes");
    expect(result.content[0].text).toContain("Subtasks were also deleted.");
  });

  it("defaults deleteSubtasks to false", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "deleteIssue").mockResolvedValue(undefined);

    const result = await handleDeleteIssue(
      { issueKey: "PROJ-789" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(spy).toHaveBeenCalledWith("PROJ-789", false);
    expect(result.content[0].text).toContain("No");
  });

  it("returns auth error when session is missing", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockRejectedValue(
      Object.assign(new Error("No session"), { code: "AUTH_REQUIRED", name: "McpError" })
    );
    // Make isMcpError return true for our mock
    const { McpError } = await import("../errors.js");
    vi.mocked(sessionManager.loadAndValidateSession).mockRejectedValue(
      new McpError("AUTH_REQUIRED", "No session found")
    );

    const result = await handleDeleteIssue(
      { issueKey: "PROJ-123" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("AUTH_REQUIRED");
  });
});
