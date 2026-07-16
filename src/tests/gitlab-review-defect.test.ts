import { describe, expect, it } from "vitest";
import { CUSTOM_FIELD, FIELD } from "../jira/constants.js";
import {
  buildGitlabNoteIdMarker,
  buildReviewDefectDescription,
  buildReviewDefectFields,
  buildReviewDefectSummary,
  GITLAB_NOTE_ID_MARKER_PREFIX,
} from "../jira/gitlab-review-defect.js";
import type { GitlabReviewCommentCandidate } from "../gitlab/mappers.js";

const sampleCandidate: GitlabReviewCommentCandidate = {
  dedupKey: "https://gitlab.example.com|group/app|42|10",
  noteId: 10,
  discussionId: "d1",
  body: "Please fix null check in login",
  createdAt: "2026-07-15T10:00:00.000Z",
  dueDate: "2026-07-15",
  commentAuthorUsername: "reviewer1",
  mrAuthorUsername: "thanhnn",
  mrIid: 42,
  mrTitle: "Fix login",
  mrUrl: "https://gitlab.example.com/group/app/-/merge_requests/42",
  filePath: "src/a.ts",
  line: 12,
  gitlabBaseUrl: "https://gitlab.example.com",
  projectPath: "group/app",
};

describe("buildReviewDefectSummary", () => {
  it("prefixes Review Code and MR IID and truncates long bodies", () => {
    expect(buildReviewDefectSummary(sampleCandidate)).toContain("[Review Code]");
    expect(buildReviewDefectSummary(sampleCandidate)).toContain("[MR !42]");
    expect(buildReviewDefectSummary(sampleCandidate).length).toBeLessThanOrEqual(180);
  });
});

describe("buildReviewDefectDescription", () => {
  it("includes clickable gitlab-note-id marker for dedup", () => {
    const desc = buildReviewDefectDescription(sampleCandidate);
    expect(desc).toContain(GITLAB_NOTE_ID_MARKER_PREFIX);
    expect(desc).toContain(
      "https://gitlab.example.com/group/app/-/merge_requests/42#note_10"
    );
    expect(desc).not.toContain(sampleCandidate.dedupKey);
    expect(desc).toContain("src/a.ts:12");
  });
});

describe("buildGitlabNoteIdMarker", () => {
  it("formats marker with MR note URL", () => {
    expect(buildGitlabNoteIdMarker(sampleCandidate)).toBe(
      "gitlab-note-id: https://gitlab.example.com/group/app/-/merge_requests/42#note_10"
    );
  });
});

describe("buildReviewDefectFields", () => {
  it("builds create fields with assignee reporter duedate and project stages", () => {
    const fields = buildReviewDefectFields("PROJ", {
      candidate: sampleCandidate,
      assigneeName: "thanhnn@runsystem.net",
      reporterName: "reviewer1@runsystem.net",
    });
    expect(fields[FIELD.PROJECT]).toEqual({ key: "PROJ" });
    expect(fields[FIELD.ASSIGNEE]).toEqual({ name: "thanhnn@runsystem.net" });
    expect(fields[CUSTOM_FIELD.REPORTER]).toEqual({ name: "reviewer1@runsystem.net" });
    expect(fields[FIELD.DUE_DATE]).toBe("2026-07-15");
    expect(fields[CUSTOM_FIELD.PROJECT_STAGES]).toEqual({ value: "Coding" });
  });

  it("accepts custom project stage", () => {
    const fields = buildReviewDefectFields(
      "PROJ",
      {
        candidate: sampleCandidate,
        assigneeName: "thanhnn@runsystem.net",
        reporterName: "reviewer1@runsystem.net",
      },
      "BASIC_DESIGN"
    );
    expect(fields[CUSTOM_FIELD.PROJECT_STAGES]).toEqual({ value: "Basic Design" });
  });
});
