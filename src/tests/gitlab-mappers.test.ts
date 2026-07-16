import { describe, expect, it } from "vitest";
import {
  buildDedupKey,
  buildGitlabNoteUrl,
  extractTopLevelReviewComments,
} from "../gitlab/mappers.js";
import type { GitlabRawDiscussion, GitlabRawMergeRequest } from "../types/gitlab-api.js";

const mr: GitlabRawMergeRequest = {
  iid: 42,
  title: "Fix login",
  web_url: "https://gitlab.example.com/group/app/-/merge_requests/42",
  author: { username: "thanhnn" },
};

describe("buildDedupKey", () => {
  it("normalizes trailing slash on base URL", () => {
    expect(buildDedupKey("https://gitlab.example.com/", "group/app", 1, 99)).toBe(
      "https://gitlab.example.com|group/app|1|99"
    );
  });
});

describe("buildGitlabNoteUrl", () => {
  it("builds clickable MR note URL with hash fragment", () => {
    expect(
      buildGitlabNoteUrl(
        "https://devops.runsystem.info/",
        "dno/du2/microcopy-e-learning-system",
        93,
        1625816
      )
    ).toBe(
      "https://devops.runsystem.info/dno/du2/microcopy-e-learning-system/-/merge_requests/93#note_1625816"
    );
  });
});

describe("extractTopLevelReviewComments", () => {
  it("keeps top-level human notes and ignores replies and system notes", () => {
    const discussions: GitlabRawDiscussion[] = [
      {
        id: "d1",
        notes: [
          {
            id: 10,
            body: "Please fix null check",
            system: false,
            created_at: "2026-07-15T10:00:00.000Z",
            author: { username: "reviewer1" },
            position: { new_path: "src/a.ts", new_line: 12 },
          },
          {
            id: 11,
            body: "Will do",
            system: false,
            created_at: "2026-07-15T11:00:00.000Z",
            author: { username: "thanhnn" },
          },
        ],
      },
      {
        id: "d2",
        notes: [
          {
            id: 20,
            body: "added 1 commit",
            system: true,
            created_at: "2026-07-15T09:00:00.000Z",
            author: { username: "thanhnn" },
          },
        ],
      },
      {
        id: "d3",
        notes: [
          {
            id: 30,
            body: "Another defect",
            system: false,
            created_at: "2026-07-16T08:00:00.000Z",
            author: { username: "reviewer2" },
          },
        ],
      },
    ];

    const result = extractTopLevelReviewComments({
      gitlabBaseUrl: "https://gitlab.example.com",
      projectPath: "group/app",
      mr,
      discussions,
    });

    expect(result).toHaveLength(2);
    expect(result[0].noteId).toBe(10);
    expect(result[0].commentAuthorUsername).toBe("reviewer1");
    expect(result[0].mrAuthorUsername).toBe("thanhnn");
    expect(result[0].dueDate).toBe("2026-07-15");
    expect(result[0].filePath).toBe("src/a.ts");
    expect(result[0].line).toBe(12);
    expect(result[1].noteId).toBe(30);
    expect(result.every((c) => c.noteId !== 11 && c.noteId !== 20)).toBe(true);
  });

  it("skips notes without author usernames", () => {
    const discussions: GitlabRawDiscussion[] = [
      {
        id: "d1",
        notes: [
          {
            id: 1,
            body: "orphan",
            system: false,
            created_at: "2026-07-15T10:00:00.000Z",
            author: {},
          },
        ],
      },
    ];

    expect(
      extractTopLevelReviewComments({
        gitlabBaseUrl: "https://gitlab.example.com",
        projectPath: "group/app",
        mr,
        discussions,
      })
    ).toHaveLength(0);
  });
});
