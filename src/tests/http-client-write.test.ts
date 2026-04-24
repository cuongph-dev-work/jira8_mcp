import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildMinimalAdfDocument } from "../jira/adf.js";

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

describe("JiraHttpClient write helpers", () => {
  const BASE_URL = "https://jira.example.com";
  const cookies = { cookieHeader: "JSESSIONID=abc" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns transitions with destination status names", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: {
        transitions: [
          { id: "11", name: "Start Progress", to: { name: "In Progress" } },
          { id: "21", name: "Resolve", to: { name: "Resolved" } },
        ],
      },
    });

    await expect(client.getTransitions("DNIEM-42")).resolves.toEqual([
      { id: "11", name: "Start Progress", toStatus: "In Progress" },
      { id: "21", name: "Resolve", toStatus: "Resolved" },
    ]);
  });

  it("finds users with normalized identity fields", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: [
        {
          key: "JIRAUSER10000",
          name: "alice",
          displayName: "Alice Nguyen",
          emailAddress: "alice@example.com",
          active: true,
        },
      ],
    });

    await expect(client.findUsers("alice", 10)).resolves.toEqual([
      {
        key: "JIRAUSER10000",
        name: "alice",
        displayName: "Alice Nguyen",
        emailAddress: "alice@example.com",
        active: true,
      },
    ]);
  });

  it("returns editable metadata for an issue", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: {
        fields: {
          summary: {
            required: true,
            name: "Summary",
            schema: { type: "string" },
          },
          priority: {
            required: false,
            name: "Priority",
            schema: { type: "priority" },
            allowedValues: [{ id: "3", name: "Medium" }],
          },
        },
      },
    });

    const result = await client.getEditMeta("DNIEM-42");
    expect(result.issueKey).toBe("DNIEM-42");
    expect(result.fields).toContainEqual({
      id: "priority",
      name: "Priority",
      required: false,
      schemaType: "priority",
      allowedValues: [{ id: "3", name: "Medium", value: null }],
    });
  });

  it("posts a transition payload with optional comment and fields", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 204,
      data: "",
    });

    await expect(
      client.transitionIssue("DNIEM-42", {
        transition: { id: "31" },
        update: {
          comment: [{ add: { body: buildMinimalAdfDocument("Done") } }],
        },
        fields: { resolution: { id: "10000" } },
      })
    ).resolves.toBeUndefined();
  });

  it("creates a comment and returns its id", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { id: "10001", self: `${BASE_URL}/rest/api/2/issue/DNIEM-42/comment/10001` },
    });

    await expect(
      client.addComment("DNIEM-42", { body: buildMinimalAdfDocument("Investigating") })
    ).resolves.toEqual({
      id: "10001",
      issueKey: "DNIEM-42",
      url: `${BASE_URL}/browse/DNIEM-42`,
    });
  });

  it("updates a comment and returns its id", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.put).mockResolvedValue({
      status: 200,
      data: { id: "10001" },
    });

    await expect(
      client.updateComment("DNIEM-42", "10001", { body: buildMinimalAdfDocument("Updated") })
    ).resolves.toEqual({
      id: "10001",
      issueKey: "DNIEM-42",
      url: `${BASE_URL}/browse/DNIEM-42`,
    });
  });

  it("deletes a comment", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.delete).mockResolvedValue({
      status: 204,
      data: "",
    });

    await expect(client.deleteComment("DNIEM-42", "10001")).resolves.toBeUndefined();
  });

  it("updates issue fields via PUT /issue/{key}", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.put).mockResolvedValue({
      status: 204,
      data: "",
    });

    await expect(
      client.updateIssueFields("DNIEM-42", {
        fields: { summary: "Updated title" },
      })
    ).resolves.toBeUndefined();
  });

  it("creates an issue link", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { linkId: "20001" },
    });

    await expect(
      client.linkIssues({
        type: { name: "Blocks" },
        inwardIssue: { key: "DNIEM-42" },
        outwardIssue: { key: "DNIEM-43" },
      })
    ).resolves.toEqual({ linkId: "20001" });
  });

  it("returns issue links with direction and linked issue details", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: {
        key: "DNIEM-42",
        fields: {
          issuelinks: [
            {
              id: "90001",
              type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
              outwardIssue: {
                key: "DNIEM-43",
                fields: {
                  summary: "Blocked task",
                  status: { name: "Open" },
                  issuetype: { name: "Task" },
                },
              },
            },
          ],
        },
      },
    });

    await expect(client.getIssueLinks("DNIEM-42")).resolves.toEqual({
      issueKey: "DNIEM-42",
      links: [
        {
          id: "90001",
          type: "Blocks",
          direction: "outward",
          relationship: "blocks",
          issueKey: "DNIEM-43",
          summary: "Blocked task",
          status: "Open",
          issueType: "Task",
          url: `${BASE_URL}/browse/DNIEM-43`,
        },
      ],
    });
  });

  it("returns subtasks for an issue", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: {
        issues: [
          {
            key: "DNIEM-44",
            fields: {
              summary: "Implement unit tests",
              status: { name: "In Progress" },
              issuetype: { name: "Sub-task" },
              assignee: { displayName: "Alice" },
              priority: { name: "Medium" },
            },
          },
        ],
      },
    });

    await expect(client.getSubtasks("DNIEM-42")).resolves.toEqual({
      issueKey: "DNIEM-42",
      subtasks: [
        {
          key: "DNIEM-44",
          summary: "Implement unit tests",
          status: "In Progress",
          issueType: "Sub-task",
          assignee: "Alice",
          priority: "Medium",
          url: `${BASE_URL}/browse/DNIEM-44`,
        },
      ],
    });
  });

  it("creates a subtask with parent and explicit issue type", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { id: "10002", key: "DNIEM-44" },
    });

    await expect(
      client.createSubtask({
        parentIssueKey: "DNIEM-42",
        issueTypeId: "10003",
        fields: { project: { key: "DNIEM" }, summary: "Subtask" },
      })
    ).resolves.toEqual({
      id: "10002",
      key: "DNIEM-44",
      url: `${BASE_URL}/browse/DNIEM-44`,
    });
  });

  it("clones an issue from core source fields with summary prefix", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: {
        fields: {
          project: { key: "DNIEM" },
          issuetype: { id: "10000" },
          summary: "Original task",
          labels: ["agent"],
        },
      },
    });
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { id: "10003", key: "DNIEM-45" },
    });

    await expect(
      client.cloneIssue({ sourceIssueKey: "DNIEM-42", summaryPrefix: "Clone of" })
    ).resolves.toEqual({
      id: "10003",
      key: "DNIEM-45",
      url: `${BASE_URL}/browse/DNIEM-45`,
    });
    expect(mockedInstance.post).toHaveBeenCalledWith(
      `${BASE_URL}/rest/api/2/issue`,
      {
        fields: {
          project: { key: "DNIEM" },
          issuetype: { id: "10000" },
          summary: "Clone of Original task",
          labels: ["agent"],
        },
      }
    );
  });

  it("assigns an issue to a user", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.put).mockResolvedValue({
      status: 204,
      data: "",
    });

    await expect(
      client.assignIssue("DNIEM-42", { name: "alice" })
    ).resolves.toBeUndefined();
  });

  it("returns my Tempo worklogs", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: [
        {
          tempoWorklogId: 30001,
          issueKey: "DNIEM-42",
          timeSpent: "2h",
          timeSpentSeconds: 7200,
          startDate: "2026-04-24",
          comment: "Implementation",
        },
      ],
    });

    await expect(
      client.getMyWorklogs({ workerKey: "alice", dateFrom: "2026-04-01", dateTo: "2026-04-30" })
    ).resolves.toHaveLength(1);
  });

  it("updates a Tempo worklog", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.put).mockResolvedValue({
      status: 200,
      data: {
        tempoWorklogId: 30001,
        jiraWorklogId: 40001,
        workerKey: "alice",
        timeSpentSeconds: 3600,
        timeSpent: "1h",
        startDate: "2026-04-24",
        originTaskId: 42,
        comment: "Updated",
        billableSeconds: null,
        dateCreated: "2026-04-24",
        dateUpdated: "2026-04-24",
        issue: { key: "DNIEM-42", summary: "Task", projectKey: "DNIEM" },
      },
    });

    await expect(
      client.updateWorklog("30001", { timeSpentSeconds: 3600, comment: "Updated" })
    ).resolves.toMatchObject({ tempoWorklogId: 30001, timeSpent: "1h" });
  });

  it("deletes a Tempo worklog", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.delete).mockResolvedValue({
      status: 204,
      data: "",
    });

    await expect(client.deleteWorklog("30001")).resolves.toBeUndefined();
  });

  it("uploads an attachment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jira-run-mcp-"));
    const filePath = join(dir, "report.txt");
    await writeFile(filePath, "attachment content");
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: [
        {
          id: "50001",
          filename: "report.txt",
          size: 18,
          mimeType: "text/plain",
          content: `${BASE_URL}/secure/attachment/50001/report.txt`,
        },
      ],
    });

    await expect(client.addAttachment("DNIEM-42", filePath)).resolves.toEqual([
      {
        id: "50001",
        filename: "report.txt",
        size: 18,
        mimeType: "text/plain",
        url: `${BASE_URL}/secure/attachment/50001/report.txt`,
      },
    ]);
  });

  it("returns projects, components, and priorities", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.get)
      .mockResolvedValueOnce({
        status: 200,
        data: [{ id: "10000", key: "DNIEM", name: "DNIEM Project" }],
      })
      .mockResolvedValueOnce({
        status: 200,
        data: [{ id: "20000", name: "QA", description: "Quality" }],
      })
      .mockResolvedValueOnce({
        status: 200,
        data: [{ id: "3", name: "Medium", description: "Medium priority", iconUrl: "icon.png" }],
      });

    await expect(client.getProjects()).resolves.toEqual([
      { id: "10000", key: "DNIEM", name: "DNIEM Project", url: `${BASE_URL}/projects/DNIEM` },
    ]);
    await expect(client.getComponents("DNIEM")).resolves.toEqual([
      { id: "20000", name: "QA", description: "Quality" },
    ]);
    await expect(client.getPriorities()).resolves.toEqual([
      { id: "3", name: "Medium", description: "Medium priority", iconUrl: "icon.png" },
    ]);
  });
});
