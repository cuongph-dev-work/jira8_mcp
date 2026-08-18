// ---------------------------------------------------------------------------
// Raw Jira / Tempo API response types
//
// These types mirror the exact shape returned by Jira and Tempo REST APIs.
// They are NOT normalized — tool handlers should map them to the stable
// interfaces in `src/types.ts` before returning data to MCP clients.
//
// Keeping raw API types separate makes it easy to:
//   1. Track API changes independently of internal types.
//   2. Generate API documentation from these definitions.
//   3. Quickly diff against official Jira/Tempo OpenAPI specs.
// ---------------------------------------------------------------------------

// ========================== Tempo Timesheets v4 ============================

/** Raw issue item returned by Jira POST /rest/api/2/search. */
export interface JiraRawSearchIssue {
  key: string;
  self?: string;
  fields?: Record<string, unknown>;
}

/** Raw search response returned by Jira POST /rest/api/2/search. */
export interface JiraRawSearchResponse {
  total: number;
  startAt?: number;
  maxResults?: number;
  issues: JiraRawSearchIssue[];
}

/** Nested issue object in Tempo worklog response */
export interface TempoRawIssue {
  id: number;
  key: string;
  summary: string;
  issueType: string;
  issueStatus: string;
  projectId: number;
  projectKey: string;
  iconUrl: string;
  internalIssue: boolean;
  reporterKey: string;
  originalEstimateSeconds: number;
  estimatedRemainingSeconds: number;
  versions: unknown[];
  components: unknown[];
  epicKey?: string;
  epicIssue?: unknown;
  parentKey?: string;
  parentIssue?: unknown;
}

/** Tempo work attribute value in worklog response */
export interface TempoRawWorkAttribute {
  workAttributeId: number;
  key: string;
  name: string;
  value: string;
  type: string;
}

/** Location in Tempo worklog response */
export interface TempoRawLocation {
  id: number;
  name: string;
}

/** Full raw worklog from Tempo POST /worklogs/search */
export interface TempoRawWorklog {
  tempoWorklogId: number;
  originId: number;
  originTaskId: number;
  timeSpent: string;
  timeSpentSeconds: number;
  billableSeconds: number;
  started: string;
  comment: string | null;
  worker: string;
  updater: string;
  dateCreated: string;
  dateUpdated: string;
  issue: TempoRawIssue;
  location?: TempoRawLocation;
  attributes: Record<string, TempoRawWorkAttribute>;
}

/** Timesheet approval raw response object from GET /timesheet-approval */
export interface TempoRawTimesheetApprovalItem {
  user: {
    self: string;
    name: string;
    key: string;
    displayName: string;
    avatar: string;
  };
  status: string;
  workedSeconds: number;
  submittedSeconds: number;
  requiredSeconds: number;
  requiredSecondsRelativeToday: number;
  period: {
    periodView: string;
    dateFrom: string;
    dateTo: string;
  };
  smartDateString: string;
  worklogs?: {
    href: string;
  };
}

export interface TempoRawTimesheetApprovalResponse {
  team?: {
    self: string;
    id: number;
    name: string;
  };
  period?: {
    dateFrom: string;
    dateTo: string;
    periodId: string;
    periodView: string;
  };
  approvals: TempoRawTimesheetApprovalItem[];
}

/** Raw response item from Tempo POST /tempo-teams/3/search */
export interface TempoRawTeam {
  id: number;
  name: string;
  summary?: string;
  lead?: {
    name: string;
    key: string;
    displayName: string;
    avatar?: Record<string, string>;
    active?: boolean;
  };
  isPublic?: boolean;
}

/** Raw user actor/reviewer inside an approval log action */
export interface TempoRawApprovalLogUser {
  self: string;
  name: string;
  key: string;
  displayName: string;
  avatar: string;
}

/** Raw action object inside an approval log entry */
export interface TempoRawApprovalLogAction {
  name: string;
  comment: string;
  reviewer: TempoRawApprovalLogUser;
  actor: TempoRawApprovalLogUser;
  created: string;
}

/**
 * Raw approval log entry from GET /timesheet-approval/log
 * Each entry represents one status transition (submit, approve, etc.)
 */
export interface TempoRawApprovalLogEntry {
  user: TempoRawApprovalLogUser;
  status: string;
  workedSeconds: number;
  submittedSeconds: number;
  requiredSeconds: number;
  requiredSecondsRelativeToday: number;
  period: {
    periodView: string;
    dateFrom: string;
    dateTo: string;
  };
  action: TempoRawApprovalLogAction;
  worklogs?: {
    href: string;
  };
}

/**
 * Raw response from GET /timesheet-approval/log
 * Keys are user keys (username or JIRAUSER...), values are arrays of log entries.
 * An empty array means the user has no approval history for the period.
 */
export type TempoRawApprovalLogResponse = Record<string, TempoRawApprovalLogEntry[]>;

/**
 * Response shape from POST /worklogs/export/filter.
 * Live Tempo Server returns `{ filterKey }`; older/alternate shapes may use
 * filterId/id/uuid/raw-string (see `extractFilterId` in http-client.ts).
 */
export interface TempoRawExportFilterResponse {
  filterKey?: string;
  filterId?: string;
  id?: string;
  uuid?: string;
}

export interface JiraRawChangelogItem {
  field?: string;
  fieldtype?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

export interface JiraRawChangelogHistory {
  id?: string;
  author?: { displayName?: string; name?: string } | null;
  created?: string;
  items?: JiraRawChangelogItem[];
}

export interface JiraRawChangelogResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  histories?: JiraRawChangelogHistory[];
}
