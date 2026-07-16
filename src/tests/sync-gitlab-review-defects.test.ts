import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { GitlabHttpClient } from "../gitlab/http-client.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  appendGitlabReviewDedupIds,
  loadGitlabReviewDedupStore,
} from "../jira/gitlab-review-dedup-store.js";
import { loadGitlabProjectLinks } from "../jira/gitlab-project-map.js";
import {
  handleSyncGitlabReviewDefects,
  resolveQuery,
  syncGitlabReviewDefectsSchema,
} from "../tools/sync-gitlab-review-defects.js";

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself" as const,
  ATTACHMENT_WORKSPACE: "downloads",
  LOG_LEVEL: "info" as const,
  PLAYWRIGHT_HEADLESS: false as const,
  PLAYWRIGHT_BROWSER: "chromium" as const,
  GITLAB_TOKEN: "glpat-test",
};

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: vi.fn(),
}));

vi.mock("../gitlab/http-client.js", () => ({
  GitlabHttpClient: vi.fn(),
}));

describe("syncGitlabReviewDefectsSchema", () => {
  it("defaults dryRun to true, mrState to merged, and projectStage to CODING", () => {
    const parsed = syncGitlabReviewDefectsSchema.parse({ projectKey: "PROJ" });
    expect(parsed.dryRun).toBe(true);
    expect(parsed.mrState).toBe("merged");
    expect(parsed.userOverrides).toEqual({});
    expect(parsed.projectStage).toBe("CODING");
  });

  it("accepts mrState opened/closed and mrIid", () => {
    expect(
      syncGitlabReviewDefectsSchema.parse({ projectKey: "PROJ", mrState: "opened" }).mrState
    ).toBe("opened");
    expect(
      syncGitlabReviewDefectsSchema.parse({ projectKey: "PROJ", mrState: "closed" }).mrState
    ).toBe("closed");
    expect(
      syncGitlabReviewDefectsSchema.parse({ projectKey: "PROJ", mrIid: 42 }).mrIid
    ).toBe(42);
  });

  it("rejects empty projectKey", () => {
    expect(syncGitlabReviewDefectsSchema.safeParse({ projectKey: "" }).success).toBe(false);
  });
});

describe("resolveQuery", () => {
  it("builds email from GitLab username", () => {
    expect(resolveQuery("thanhnn", {})).toBe("thanhnn@runsystem.net");
  });

  it("prefers userOverrides", () => {
    expect(resolveQuery("thanhnn", { thanhnn: "thanh.nguyen" })).toBe("thanh.nguyen");
  });
});

describe("gitlab project map + dedup store", () => {
  it("loads links for a project key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gitlab-map-"));
    const file = join(dir, "gitlab-projects.json");
    await writeFile(
      file,
      JSON.stringify({
        PROJ: [
          {
            gitlabBaseUrl: "https://gitlab.example.com/",
            projectPath: "/group/app/",
          },
        ],
      }),
      "utf8"
    );

    const links = await loadGitlabProjectLinks("PROJ", file);
    expect(links).toEqual([
      { gitlabBaseUrl: "https://gitlab.example.com", projectPath: "group/app" },
    ]);
  });

  it("appends dedup ids", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gitlab-dedup-"));
    const file = join(dir, "dedup.json");
    await appendGitlabReviewDedupIds(["a", "b"], file);
    await appendGitlabReviewDedupIds(["b", "c"], file);
    const ids = await loadGitlabReviewDedupStore(file);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("handleSyncGitlabReviewDefects", () => {
  let mockFindUsers: ReturnType<typeof vi.fn>;
  let mockSearchIssues: ReturnType<typeof vi.fn>;
  let mockCreateIssue: ReturnType<typeof vi.fn>;
  let mockListMrs: ReturnType<typeof vi.fn>;
  let mockGetMr: ReturnType<typeof vi.fn>;
  let mockListDiscussions: ReturnType<typeof vi.fn>;
  let mapFile: string;
  let dedupFile: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindUsers = vi.fn();
    mockSearchIssues = vi.fn().mockResolvedValue({ total: 0, issues: [] });
    mockCreateIssue = vi.fn();
    mockListMrs = vi.fn();
    mockGetMr = vi.fn();
    mockListDiscussions = vi.fn();

    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "c" });
    vi.mocked(JiraHttpClient).mockImplementation(
      () =>
        ({
          findUsers: mockFindUsers,
          searchIssues: mockSearchIssues,
          createIssue: mockCreateIssue,
        }) as never
    );
    vi.mocked(GitlabHttpClient).mockImplementation(
      () =>
        ({
          listMergeRequests: mockListMrs,
          getMergeRequest: mockGetMr,
          listMergeRequestDiscussions: mockListDiscussions,
        }) as never
    );

    const dir = await mkdtemp(join(tmpdir(), "sync-gitlab-"));
    mapFile = join(dir, "gitlab-projects.json");
    dedupFile = join(dir, "dedup.json");
    await mkdir(dir, { recursive: true });
    await writeFile(
      mapFile,
      JSON.stringify({
        PROJ: [
          {
            gitlabBaseUrl: "https://gitlab.example.com",
            projectPath: "group/app",
          },
        ],
      }),
      "utf8"
    );

    mockListMrs.mockResolvedValue([
      {
        iid: 42,
        title: "Fix login",
        web_url: "https://gitlab.example.com/group/app/-/merge_requests/42",
        author: { username: "thanhnn" },
      },
    ]);
    mockListDiscussions.mockResolvedValue([
      {
        id: "d1",
        notes: [
          {
            id: 10,
            body: "Please fix null check",
            system: false,
            created_at: "2026-07-15T10:00:00.000Z",
            author: { username: "reviewer1" },
          },
          {
            id: 11,
            body: "reply ignored",
            system: false,
            created_at: "2026-07-15T11:00:00.000Z",
            author: { username: "thanhnn" },
          },
        ],
      },
    ]);
  });

  it("returns CONFIG_ERROR when GITLAB_TOKEN missing", async () => {
    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ" },
      { ...mockConfig, GITLAB_TOKEN: undefined }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("GITLAB_TOKEN");
  });

  it("dryRun lists candidates and does not create", async () => {
    mockFindUsers.mockImplementation(async (query: string) => [
      {
        name: query,
        key: query,
        displayName: query,
        emailAddress: query,
        active: true,
      },
    ]);

    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ", dryRun: true, mrState: "opened" },
      mockConfig,
      { gitlabProjectsFile: mapFile, gitlabDedupFile: dedupFile }
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("dryRun");
    expect(result.content[0].text).toContain("mrState=opened");
    expect(result.content[0].text).toContain("Candidates");
    expect(result.content[0].text).toContain("Please fix null check");
    expect(result.content[0].text).toContain("create payload");
    expect(result.content[0].text).toContain('"issuetype"');
    expect(mockListMrs).toHaveBeenCalledWith("group/app", "opened");
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it("processes a single MR when mrIid is set", async () => {
    mockListMrs.mockResolvedValue([]);
    mockGetMr.mockResolvedValue({
      iid: 7,
      title: "One MR",
      web_url: "https://gitlab.example.com/group/app/-/merge_requests/7",
      author: { username: "thanhnn" },
    });
    mockListDiscussions.mockResolvedValue([
      {
        id: "d1",
        notes: [
          {
            id: 99,
            body: "Single MR comment",
            system: false,
            created_at: "2026-07-15T10:00:00.000Z",
            author: { username: "reviewer1" },
          },
        ],
      },
    ]);
    mockFindUsers.mockImplementation(async (query: string) => [
      {
        name: query,
        key: query,
        displayName: query,
        emailAddress: query,
        active: true,
      },
    ]);

    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ", dryRun: true, mrIid: 7 },
      mockConfig,
      { gitlabProjectsFile: mapFile, gitlabDedupFile: dedupFile }
    );

    expect(result.content[0].text).toContain("single MR !7");
    expect(result.content[0].text).toContain("Single MR comment");
    expect(mockGetMr).toHaveBeenCalledWith("group/app", 7);
    expect(mockListMrs).not.toHaveBeenCalled();
  });

  it("returns needsUserMapping when lookup fails", async () => {
    mockFindUsers.mockResolvedValue([]);

    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ", dryRun: true },
      mockConfig,
      { gitlabProjectsFile: mapFile, gitlabDedupFile: dedupFile }
    );

    expect(result.content[0].text).toContain("Needs user mapping");
    expect(result.content[0].text).toContain("thanhnn@runsystem.net");
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it("apply creates Review Defect and updates local dedup", async () => {
    mockFindUsers.mockImplementation(async (query: string) => [
      {
        name: query,
        key: query,
        displayName: query,
        emailAddress: query,
        active: true,
      },
    ]);
    mockCreateIssue.mockResolvedValue({
      id: "1",
      key: "PROJ-100",
      url: "https://jira.example.com/browse/PROJ-100",
    });

    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ", dryRun: false },
      mockConfig,
      { gitlabProjectsFile: mapFile, gitlabDedupFile: dedupFile }
    );

    expect(result.content[0].text).toContain("PROJ-100");
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const payload = mockCreateIssue.mock.calls[0]?.[0] as {
      fields: Record<string, unknown>;
    };
    expect(payload.fields.customfield_10339).toEqual({ value: "Coding" });
    const ids = await loadGitlabReviewDedupStore(dedupFile);
    expect(ids.has("https://gitlab.example.com|group/app|42|10")).toBe(true);
  });

  it("skips duplicates from local store", async () => {
    await appendGitlabReviewDedupIds(
      ["https://gitlab.example.com|group/app|42|10"],
      dedupFile
    );
    mockFindUsers.mockResolvedValue([]);

    const result = await handleSyncGitlabReviewDefects(
      { projectKey: "PROJ", dryRun: true },
      mockConfig,
      { gitlabProjectsFile: mapFile, gitlabDedupFile: dedupFile }
    );

    expect(result.content[0].text).toContain("Skipped duplicates");
    expect(result.content[0].text).toContain("group/app|42|10");
  });
});
