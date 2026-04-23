// ---------------------------------------------------------------------------
// Shared types used across auth, jira, and tool layers
// ---------------------------------------------------------------------------

// Inline Playwright StorageState shape to avoid import resolution issues
export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface PlaywrightStorageState {
  cookies?: PlaywrightCookie[];
  origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

/**
 * Persisted session file structure.
 * Wraps Playwright StorageState with metadata for freshness checks.
 */
export interface SessionFile {
  /** ISO 8601 timestamp of when the session was last written */
  savedAt: string;
  /** The Jira base URL this session was created against */
  baseUrl: string;
  /** Raw Playwright browser storage state (cookies + localStorage) */
  storageState: PlaywrightStorageState;
}

/**
 * Extracted HTTP-ready cookies from a SessionFile.
 */
export interface SessionCookies {
  /** Value suitable for the Cookie request header */
  cookieHeader: string;
}

// ---------------------------------------------------------------------------
// Jira output shapes — stable, normalized, free of Jira internals
// ---------------------------------------------------------------------------

/** Compact sub-task reference (returned inside parent issue) */
export interface JiraSubtask {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
}

/** Time tracking info (jira_get_issue) */
export interface JiraTimeTracking {
  /** Original estimate, e.g. "1h" */
  originalEstimate: string | null;
  /** Remaining estimate, e.g. "30m" */
  remainingEstimate: string | null;
  /** Time already logged, e.g. "30m" */
  timeSpent: string | null;
}

/** Attachment metadata returned by jira_get_issue */
export interface JiraAttachment {
  filename: string;
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** ISO 8601 upload timestamp */
  created: string;
  /** Display name of the uploader */
  author: string | null;
  /** Direct download URL */
  downloadUrl: string;
  /** Extracted text content (only for readable types, filled by handler) */
  content?: string;
}

/** Full issue detail returned by jira_get_issue */
export interface JiraIssue {
  // --- Core identity ---
  key: string;
  summary: string;
  url: string;

  // --- Classification ---
  issueType: string;
  status: string;
  resolution: string | null;
  priority: string | null;
  labels: string[];
  components: string[];
  affectsVersions: string[];
  fixVersions: string[];

  // --- People ---
  assignee: string | null;
  reporter: string | null;
  /** customfield_10320 — Defect Owner */
  defectOwner: string | null;

  // --- Dates ---
  created: string;
  updated: string;
  dueDate: string | null;
  /** customfield_10313 — Plan Start Date */
  planStartDate: string | null;
  /** customfield_10315 — Actual Start Date */
  actualStartDate: string | null;
  /** customfield_10316 — Actual End Date */
  actualEndDate: string | null;

  // --- Time tracking ---
  timeTracking: JiraTimeTracking;

  // --- Relations ---
  /** customfield_10201 — Epic Link */
  epicLink: string | null;
  /** customfield_10203 — Epic Name (only set when the issue is an Epic) */
  epicName: string | null;
  /** Parent issue key (when this issue is itself a sub-task) */
  parent: string | null;
  /** Sub-tasks belonging to this issue */
  subtasks: JiraSubtask[];

  // --- Bug / defect custom fields ---
  /** customfield_10339 — Project Stages */
  projectStages: string | null;
  /** customfield_10323 — Defect Type */
  defectType: string | null;
  /** customfield_10336 — Defect Origin */
  defectOrigin: string | null;
  /** customfield_10324 — Cause Category */
  causeCategory: string | null;
  /** customfield_10326 — Severity */
  severity: string | null;
  /** customfield_10335 — Degrade (Yes/No) */
  degrade: string | null;
  /** customfield_10325 — Impact Assessment */
  impactAssessment: string | null;
  /** customfield_10331 — Cause Analysis */
  causeAnalysis: string | null;
  /** customfield_10333 — Action */
  action: string | null;
  /** customfield_10810 — DoD (Definition of Done) */
  dod: string | null;

  // --- Attachments ---
  attachments: JiraAttachment[];

  // --- Description ---
  description: string | null;
}

/** Compact issue summary returned inside jira_search_issues */
export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  assignee: string | null;
  priority: string | null;
  created: string;
  updated: string;
  dueDate: string | null;
  url: string;

  // Time tracking
  originalEstimate: string | null;
  remainingEstimate: string | null;
  timeSpent: string | null;

  // Custom fields (known IDs)
  /** customfield_10320 — Defect Owner */
  defectOwner: string | null;
  /** customfield_10313 — Plan Start Date */
  planStartDate: string | null;
  /** customfield_10315 — Actual Start Date */
  actualStartDate: string | null;
  /** customfield_10316 — Actual End Date */
  actualEndDate: string | null;
  /** customfield_10326 — Severity */
  severity: string | null;
  /** customfield_10336 — Defect Origin */
  defectOrigin: string | null;
  /** customfield_10338 — % Done */
  percentDone: string | null;
  /** customfield_10340 — Type of Work */
  typeOfWork: string | null;
}

/** Top-level result from jira_search_issues */
export interface JiraSearchResult {
  total: number;
  issues: JiraIssueSummary[];
}

/** Transport-level create issue result returned by Jira POST /issue */
export interface JiraCreatedIssueTransportResult {
  id: string;
  key: string;
  url: string;
}

/** Stable create issue result returned by jira_create_issue */
export interface JiraCreatedIssue {
  id: string;
  key: string;
  url: string;
  issueTypeId: string;
  issueType: string;
  summary: string;
}

/** Minimal shape returned by GET /rest/api/2/myself */
export interface JiraCurrentUser {
  /** Internal user key — used by Tempo as the `worker` field */
  key: string;
  /** Login username */
  name: string;
  /** Human-readable display name */
  displayName: string;
}

/** Tempo work attribute value (used inside worklog attributes map) */
export interface TempoWorkAttributeValue {
  name: string;
  workAttributeId: number;
  value: string;
}

/** Payload for POST /rest/tempo-timesheets/4/worklogs */
export interface TempoWorklogInput {
  worker: string;
  originTaskId: string;
  /** Start date in yyyy-MM-dd format */
  started: string;
  /** Duration in seconds */
  timeSpentSeconds: number;
  comment?: string;
  /** End date in yyyy-MM-dd format (multi-day worklogs) */
  endDate?: string | null;
  billableSeconds?: string;
  originId?: number;
  remainingEstimate?: number;
  includeNonWorkingDays?: boolean;
  /** Tempo work attributes (e.g. _Process_, _TypeOfWork_) */
  attributes?: Record<string, TempoWorkAttributeValue>;
}

/** Single worklog entry from Tempo POST /worklogs response */
export interface TempoWorklogResult {
  tempoWorklogId: number;
  jiraWorklogId: number | null;
  workerKey: string;
  timeSpentSeconds: number;
  /** Human-readable duration, e.g. "1d" */
  timeSpent: string;
  startDate: string;
  originTaskId: number;
  comment: string | null;
  billableSeconds: number | null;
  dateCreated: string;
  dateUpdated: string;
  issue: {
    key: string;
    summary: string;
    projectKey: string;
  };
}
