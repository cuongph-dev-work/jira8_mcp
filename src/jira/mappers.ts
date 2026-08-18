import type { JiraAttachment, JiraIssue, JiraIssueSummary, JiraSubtask, JiraTimeTracking } from "../types.js";

// ---------------------------------------------------------------------------
// Raw Jira types (partial — only fields we request)
// ---------------------------------------------------------------------------

interface RawNamedValue {
  name?: string;
  value?: string;
  displayName?: string;
}

interface RawUser {
  displayName?: string;
  name?: string;
}

interface RawTimeTracking {
  originalEstimate?: string;
  remainingEstimate?: string;
  timeSpent?: string;
}

interface RawSubtask {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string } | null;
  };
}

interface RawParent {
  key?: string;
}

interface RawIssueFields {
  // Standard
  summary?: string;
  description?: RawDescription | string | null;
  status?: { name?: string; statusCategory?: { key?: string; name?: string } };
  resolution?: { name?: string } | null;
  assignee?: RawUser | null;
  reporter?: RawUser | null;
  priority?: { name?: string } | null;
  issuetype?: { name?: string };
  labels?: string[];
  components?: RawNamedValue[];
  versions?: RawNamedValue[];       // affectsVersions
  fixVersions?: RawNamedValue[];
  created?: string;
  updated?: string;
  duedate?: string | null;
  timetracking?: RawTimeTracking;
  subtasks?: RawSubtask[];
  parent?: RawParent;
  attachment?: RawAttachment[];

  // Custom — People
  customfield_10320?: RawUser[] | null; // Defect Owner (array of users)

  // Custom — Dates
  customfield_10313?: string | null;  // Plan Start Date
  customfield_10315?: string | null;  // Actual Start Date
  customfield_10316?: string | null;  // Actual End Date

  // Custom — Relations
  customfield_10201?: string | null;  // Epic Link (key)
  customfield_10203?: string | null;  // Epic Name

  // Custom — Bug / Defect
  customfield_10339?: RawNamedValue | null; // Project Stages
  customfield_10323?: RawNamedValue | null; // Defect Type
  customfield_10336?: RawNamedValue | null; // Defect Origin
  customfield_10324?: RawNamedValue | null; // Cause Category
  customfield_10326?: RawNamedValue | null; // Severity
  customfield_10335?: RawNamedValue | null; // Degrade
  customfield_10325?: string | null;        // Impact Assessment (textarea)
  customfield_10331?: string | null;        // Cause Analysis (textarea)
  customfield_10333?: string | null;        // Action (textarea)
  customfield_10810?: RawNamedValue | null; // DoD

  // Custom — Work/Progress
  customfield_10338?: RawNamedValue | null; // % Done
  customfield_11919?: RawNamedValue | string | number | null; // Progress (WBSGantt)
  customfield_10340?: RawNamedValue | null; // Type of Work
}

interface RawIssue {
  key: string;
  fields?: RawIssueFields;
  self?: string;
}

// Jira 8 description can be plain text or Atlassian Document Format (ADF)
interface RawDescription {
  type?: string;
  content?: RawAdfNode[];
  text?: string;
  version?: number;
}

interface RawAdfNode {
  type?: string;
  text?: string;
  content?: RawAdfNode[];
}

interface RawAttachment {
  id?: string;
  filename?: string;
  author?: RawUser;
  created?: string;
  size?: number;
  mimeType?: string;
  content?: string; // download URL
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps a raw Jira issue payload to the stable JiraIssue output shape.
 */
export function mapIssue(raw: RawIssue, baseUrl: string): JiraIssue {
  const f = raw.fields ?? {};

  return {
    // Core identity
    key: raw.key,
    summary: f.summary ?? "(no summary)",
    url: `${baseUrl}/browse/${raw.key}`,

    // Classification
    issueType: f.issuetype?.name ?? "Unknown",
    status: f.status?.name ?? "Unknown",
    resolution: f.resolution?.name ?? null,
    priority: f.priority?.name ?? null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name ?? "").filter(Boolean),
    affectsVersions: (f.versions ?? []).map((v) => v.name ?? "").filter(Boolean),
    fixVersions: (f.fixVersions ?? []).map((v) => v.name ?? "").filter(Boolean),

    // People
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    defectOwner: f.customfield_10320?.[0]?.displayName ?? null,

    // Dates
    created: f.created ?? "",
    updated: f.updated ?? "",
    dueDate: f.duedate ?? null,
    planStartDate: f.customfield_10313 ?? null,
    actualStartDate: f.customfield_10315 ?? null,
    actualEndDate: f.customfield_10316 ?? null,

    // Time tracking
    timeTracking: extractTimeTracking(f.timetracking),

    // Relations
    epicLink: f.customfield_10201 ?? null,
    epicName: f.customfield_10203 ?? null,
    parent: f.parent?.key ?? null,
    subtasks: (f.subtasks ?? []).map((s) => mapSubtask(s)),

    // Bug / defect custom fields
    projectStages: pickNameOrValue(f.customfield_10339),
    defectType: pickNameOrValue(f.customfield_10323),
    defectOrigin: pickNameOrValue(f.customfield_10336),
    causeCategory: pickNameOrValue(f.customfield_10324),
    severity: pickNameOrValue(f.customfield_10326),
    degrade: pickNameOrValue(f.customfield_10335),
    impactAssessment: f.customfield_10325 ?? null,
    causeAnalysis: f.customfield_10331 ?? null,
    action: f.customfield_10333 ?? null,
    dod: pickNameOrValue(f.customfield_10810),

    // Attachments (metadata only — content filled later by handler)
    attachments: (f.attachment ?? []).map((a) => mapAttachment(a)),

    // Description (last — it can be long)
    description: extractDescription(f.description),
  };
}

/**
 * Maps a raw Jira issue to the compact JiraIssueSummary shape.
 */
export function mapIssueSummary(
  raw: RawIssue,
  baseUrl: string,
  options?: { includeDescription?: boolean }
): JiraIssueSummary {
  const f = raw.fields ?? {};
  const tt = f.timetracking;
  const summary: JiraIssueSummary = {
    key: raw.key,
    summary: f.summary ?? "(no summary)",
    status: f.status?.name ?? "Unknown",
    statusCategory: f.status?.statusCategory?.key ?? f.status?.statusCategory?.name ?? null,
    issueType: f.issuetype?.name ?? "Unknown",
    assignee: f.assignee?.displayName ?? null,
    priority: f.priority?.name ?? null,
    created: f.created ?? "",
    updated: f.updated ?? "",
    dueDate: f.duedate ?? null,
    url: `${baseUrl}/browse/${raw.key}`,
    labels: f.labels ?? [],

    // Time tracking
    originalEstimate: tt?.originalEstimate ?? null,
    originalEstimateSeconds: parseEstimateSeconds(tt?.originalEstimate),
    remainingEstimate: tt?.remainingEstimate ?? null,
    timeSpent: tt?.timeSpent ?? null,

    // Custom fields
    defectOwner: f.customfield_10320?.[0]?.displayName ?? null,
    planStartDate: f.customfield_10313 ?? null,
    actualStartDate: f.customfield_10315 ?? null,
    actualEndDate: f.customfield_10316 ?? null,
    severity: pickNameOrValue(f.customfield_10326),
    defectOrigin: pickNameOrValue(f.customfield_10336),
    percentDone: pickNameOrValue(f.customfield_10338),
    progressWbsGantt: pickNameOrValue(f.customfield_11919),
    typeOfWork: pickNameOrValue(f.customfield_10340),
  };

  if (options?.includeDescription) {
    summary.description = extractDescription(f.description);
  }

  return summary;
}

function parseEstimateSeconds(value: string | undefined): number | null {
  if (!value) return null;
  let total = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/gi)) {
    const amount = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    total += amount * (unit === "w" ? 144000 : unit === "d" ? 28800 : unit === "h" ? 3600 : 60);
  }
  return total > 0 ? total : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extracts the human-readable value from a Jira select/radio field object. */
function pickNameOrValue(field: RawNamedValue | string | number | null | undefined): string | null {
  if (!field) return null;
  if (typeof field === "string" || typeof field === "number") return String(field);
  return field.value ?? field.name ?? null;
}

function mapSubtask(raw: RawSubtask): JiraSubtask {
  return {
    key: raw.key ?? "",
    summary: raw.fields?.summary ?? "(no summary)",
    status: raw.fields?.status?.name ?? "Unknown",
    issueType: raw.fields?.issuetype?.name ?? "Unknown",
    priority: raw.fields?.priority?.name ?? null,
  };
}

function mapAttachment(raw: RawAttachment): JiraAttachment {
  return {
    filename: raw.filename ?? "(unknown)",
    mimeType: raw.mimeType ?? "application/octet-stream",
    size: raw.size ?? 0,
    created: raw.created ?? "",
    author: raw.author?.displayName ?? null,
    downloadUrl: raw.content ?? "",
  };
}

function extractTimeTracking(raw: RawTimeTracking | undefined): JiraTimeTracking {
  return {
    originalEstimate: raw?.originalEstimate ?? null,
    remainingEstimate: raw?.remainingEstimate ?? null,
    timeSpent: raw?.timeSpent ?? null,
  };
}

/**
 * Converts Jira 8 description to plain text.
 * Handles both plain-string and Atlassian Document Format (ADF) payloads.
 */
function extractDescription(
  raw: RawDescription | string | null | undefined
): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw.trim() || null;
  // ADF document
  return extractAdfText(raw).trim() || null;
}

function extractAdfText(node: RawAdfNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content
    .map((child) => extractAdfText(child))
    .join(node.type === "paragraph" || node.type === "heading" ? "\n" : "");
}
