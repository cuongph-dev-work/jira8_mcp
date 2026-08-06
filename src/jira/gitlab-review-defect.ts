import { buildGitlabNoteUrl, type GitlabReviewCommentCandidate } from "../gitlab/mappers.js";
import { CUSTOM_FIELD, FIELD, PROJECT_STAGE, PROJECT_STAGE_VALUE } from "./constants.js";

export const DEFAULT_REVIEW_DEFECT_PROJECT_STAGE: keyof typeof PROJECT_STAGE = "CODING";

export type ReviewDefectProjectStageKey = keyof typeof PROJECT_STAGE;

export const REVIEW_DEFECT_PROJECT_STAGE_KEYS = Object.keys(
  PROJECT_STAGE
) as Array<keyof typeof PROJECT_STAGE>;

export function resolveReviewDefectProjectStageId(
  projectStage: keyof typeof PROJECT_STAGE = DEFAULT_REVIEW_DEFECT_PROJECT_STAGE
): string {
  return PROJECT_STAGE[projectStage];
}

export function resolveReviewDefectProjectStageValue(
  projectStage: keyof typeof PROJECT_STAGE = DEFAULT_REVIEW_DEFECT_PROJECT_STAGE
): string {
  return PROJECT_STAGE_VALUE[projectStage];
}

export const GITLAB_NOTE_ID_MARKER_PREFIX = "gitlab-note-id:";

export function buildGitlabNoteIdMarker(candidate: GitlabReviewCommentCandidate): string {
  const noteUrl = buildGitlabNoteUrl(
    candidate.gitlabBaseUrl,
    candidate.projectPath,
    candidate.mrIid,
    candidate.noteId
  );
  return `${GITLAB_NOTE_ID_MARKER_PREFIX} ${noteUrl}`;
}

export interface ReviewDefectResolvedCandidate {
  candidate: GitlabReviewCommentCandidate;
  assigneeName: string;
  reporterName: string;
}

export const REVIEW_DEFECT_SUMMARY_PREFIX = "[Review Code]";

export function buildReviewDefectSummary(candidate: GitlabReviewCommentCandidate): string {
  const prefix = `${REVIEW_DEFECT_SUMMARY_PREFIX}[${candidate.name}][MR !${candidate.mrIid}] `;
  const maxBody = 180 - prefix.length;
  const body = candidate.body.replace(/\s+/g, " ").trim();
  const truncated = body.length > maxBody ? `${body.slice(0, maxBody - 1)}…` : body;
  return `${prefix}${truncated}`;
}

export function buildReviewDefectDescription(candidate: GitlabReviewCommentCandidate): string {
  const lines = [
    candidate.body,
    "",
    "----",
    `MR: ${candidate.mrUrl || `!${candidate.mrIid}`} (${candidate.mrTitle})`,
    `Comment author: ${candidate.commentAuthorUsername}`,
    `MR author: ${candidate.mrAuthorUsername}`,
  ];
  if (candidate.filePath) {
    lines.push(
      `File: ${candidate.filePath}${candidate.line != null ? `:${candidate.line}` : ""}`
    );
  }
  lines.push(buildGitlabNoteIdMarker(candidate));
  return lines.join("\n");
}

export function buildReviewDefectFields(
  projectKey: string,
  item: ReviewDefectResolvedCandidate,
  projectStage: keyof typeof PROJECT_STAGE = DEFAULT_REVIEW_DEFECT_PROJECT_STAGE
): Record<string, unknown> {
  const { candidate, assigneeName, reporterName } = item;
  return {
    [FIELD.PROJECT]: { key: projectKey },
    [FIELD.SUMMARY]: buildReviewDefectSummary(candidate),
    [FIELD.DESCRIPTION]: buildReviewDefectDescription(candidate),
    [FIELD.ASSIGNEE]: { name: assigneeName },
    [CUSTOM_FIELD.REPORTER]: { name: reporterName },
    [FIELD.DUE_DATE]: candidate.dueDate,
    [CUSTOM_FIELD.PROJECT_STAGES]: {
      value: resolveReviewDefectProjectStageValue(projectStage),
    },
  };
}
