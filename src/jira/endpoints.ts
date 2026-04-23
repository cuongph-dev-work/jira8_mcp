// ---------------------------------------------------------------------------
// Centralized Jira REST API endpoint builders
// All endpoints target Jira REST API v2 (Jira 8 default)
// ---------------------------------------------------------------------------

const API_BASE = "/rest/api/2";
const TEMPO_API_BASE = "/rest/tempo-timesheets/4";

/**
 * URL for a single issue.
 * @example issueUrl("https://jira.co", "PROJ-123")
 *   → "https://jira.co/rest/api/2/issue/PROJ-123"
 */
export function issueUrl(baseUrl: string, issueKey: string): string {
  return `${baseUrl}${API_BASE}/issue/${encodeURIComponent(issueKey)}`;
}

/**
 * URL for the create-issue endpoint.
 */
export function createIssueUrl(baseUrl: string): string {
  return `${baseUrl}${API_BASE}/issue`;
}

/**
 * URL for the JQL search endpoint.
 */
export function searchUrl(baseUrl: string): string {
  return `${baseUrl}${API_BASE}/search`;
}

/**
 * URL for the current-user endpoint (GET /rest/api/2/myself).
 */
export function myselfUrl(baseUrl: string): string {
  return `${baseUrl}${API_BASE}/myself`;
}

/**
 * URL for the Tempo create-worklog endpoint (POST).
 */
export function tempoCreateWorklogUrl(baseUrl: string): string {
  return `${baseUrl}${TEMPO_API_BASE}/worklogs`;
}

import { CUSTOM_FIELD } from "./constants.js";

/**
 * Fields to request for a full issue (jira_get_issue).
 *
 * Standard fields + all custom fields that the internal Jira instance uses.
 */
export const ISSUE_FIELDS: string[] = [
  // Standard
  "summary",
  "description",
  "status",
  "resolution",
  "assignee",
  "reporter",
  "priority",
  "issuetype",
  "labels",
  "components",
  "versions",          // affectsVersions
  "fixVersions",
  "created",
  "updated",
  "duedate",
  "timetracking",
  "subtasks",
  "parent",
  "attachment",

  // Custom — People
  CUSTOM_FIELD.DEFECT_OWNER,

  // Custom — Dates
  CUSTOM_FIELD.PLAN_START_DATE,
  CUSTOM_FIELD.ACTUAL_START_DATE,
  CUSTOM_FIELD.ACTUAL_END_DATE,

  // Custom — Relations
  CUSTOM_FIELD.EPIC_LINK,
  CUSTOM_FIELD.EPIC_NAME,

  // Custom — Bug / Defect
  CUSTOM_FIELD.PROJECT_STAGES,
  CUSTOM_FIELD.DEFECT_TYPE,
  CUSTOM_FIELD.DEFECT_ORIGIN,
  CUSTOM_FIELD.CAUSE_CATEGORY,
  CUSTOM_FIELD.SEVERITY,
  CUSTOM_FIELD.DEGRADE,
  CUSTOM_FIELD.IMPACT_ASSESSMENT,
  CUSTOM_FIELD.CAUSE_ANALYSIS,
  CUSTOM_FIELD.ACTION,
  CUSTOM_FIELD.DOD,
];

/**
 * Fields to request for a compact issue list (jira_search_issues).
 */
export const SEARCH_FIELDS: string[] = [
  "summary",
  "status",
  "issuetype",
  "assignee",
  "priority",
  "created",
  "updated",
  "duedate",
  "timetracking",

  // Custom — People
  CUSTOM_FIELD.DEFECT_OWNER,

  // Custom — Dates
  CUSTOM_FIELD.PLAN_START_DATE,
  CUSTOM_FIELD.ACTUAL_START_DATE,
  CUSTOM_FIELD.ACTUAL_END_DATE,

  // Custom — Bug / Defect
  CUSTOM_FIELD.SEVERITY,
  CUSTOM_FIELD.DEFECT_ORIGIN,

  // Custom — Work/Progress
  CUSTOM_FIELD.PERCENT_DONE,
  CUSTOM_FIELD.TYPE_OF_WORK,
];
