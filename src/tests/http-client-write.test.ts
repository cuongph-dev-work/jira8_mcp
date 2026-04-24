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
    vi.mocked(mockedInstance.get).mockResolvedValue({
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
});
