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
