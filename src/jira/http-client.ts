import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Blob } from "node:buffer";
import axios, { type AxiosInstance } from "axios";
import {
  createIssueUrl,
  issueAttachmentUrl,
  issueCommentUrl,
  issueCommentByIdUrl,
  issueEditMetaUrl,
  issueAssignUrl,
  issueLinkUrl,
  issueTransitionsUrl,
  issueUrl,
  myselfUrl,
  prioritiesUrl,
  projectComponentsUrl,
  projectsUrl,
  searchUrl,
  tempoCreateWorklogUrl,
  tempoWorklogUrl,
  tempoSearchWorklogsUrl,
  userSearchUrl,
  ISSUE_FIELDS,
  SEARCH_FIELDS,
} from "./endpoints.js";
import { normalizeEditMetaResponse } from "./edit-meta.js";
import { mapIssue, mapIssueSummary } from "./mappers.js";
import { normalizeUserSearchResponse } from "./user-search.js";
import { jiraHttpError, jiraResponseError, sessionExpired } from "../errors.js";
import type {
  JiraAttachmentUploadResult,
  JiraCloneIssueInput,
  JiraComment,
  JiraCommentResult,
  JiraCreatedIssueTransportResult,
  JiraCurrentUser,
  JiraComponent,
  JiraEditMetaResult,
  JiraIssue,
  JiraIssueLinkResult,
  JiraIssueLinksResult,
  JiraIssueTransition,
  JiraPriority,
  JiraProject,
  JiraSearchResult,
  JiraSubtaskInput,
  JiraSubtasksResult,
  JiraUserSearchResult,
  SessionCookies,
  TempoWorklogInput,
  TempoWorklogListItem,
  TempoWorklogResult,
} from "../types.js";
import type { TempoRawWorklog } from "../types/jira-api.js";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class JiraHttpClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(baseUrl: string, cookies: SessionCookies) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Cookie: cookies.cookieHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      // Block redirects — a redirect usually means the session expired and
      // Jira is sending us back to the SSO login page.
      maxRedirects: 0,
      validateStatus: () => true, // we inspect status ourselves
    });
  }

  // ---------------------------------------------------------------------------
  // jira_get_issue
  // ---------------------------------------------------------------------------

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const url = issueUrl(this.baseUrl, issueKey);
    const res = await this.http.get(url, {
      params: { fields: ISSUE_FIELDS.join(",") },
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    if (!res.data || typeof res.data !== "object" || !res.data.key) {
      throw jiraResponseError("Unexpected issue response shape", res.data);
    }

    return mapIssue(res.data, this.baseUrl);
  }

  // ---------------------------------------------------------------------------
  // jira_search_issues
  // ---------------------------------------------------------------------------

  async searchIssues(jql: string, limit: number, startAt: number = 0): Promise<JiraSearchResult> {
    const url = searchUrl(this.baseUrl);
    const res = await this.http.post(url, {
      jql,
      startAt,
      maxResults: limit,
      fields: SEARCH_FIELDS,
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { total?: number; issues?: unknown[] };
    if (!body || typeof body.total !== "number" || !Array.isArray(body.issues)) {
      throw jiraResponseError("Unexpected search response shape", body);
    }

    return {
      total: body.total,
      issues: (body.issues as Array<{ key: string; fields?: Record<string, unknown> }>).map(
        (raw) => mapIssueSummary(raw, this.baseUrl)
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // jira_create_issue
  // ---------------------------------------------------------------------------

  async createIssue(
    payload: { fields: Record<string, unknown> }
  ): Promise<JiraCreatedIssueTransportResult> {
    const url = createIssueUrl(this.baseUrl);
    const res = await this.http.post(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { id?: string; key?: string };
    if (!body || typeof body.id !== "string" || typeof body.key !== "string") {
      throw jiraResponseError("Unexpected create issue response shape", body);
    }

    return {
      id: body.id,
      key: body.key,
      url: `${this.baseUrl}/browse/${body.key}`,
    };
  }

  async getTransitions(issueKey: string): Promise<JiraIssueTransition[]> {
    const url = issueTransitionsUrl(this.baseUrl, issueKey);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as {
      transitions?: Array<{ id?: string; name?: string; to?: { name?: string } }>;
    };
    if (!body || !Array.isArray(body.transitions)) {
      throw jiraResponseError("Unexpected transitions response shape", body);
    }

    return body.transitions.map((transition) => ({
      id: transition.id ?? "",
      name: transition.name ?? "",
      toStatus: transition.to?.name ?? null,
    }));
  }

  async findUsers(query: string, maxResults: number): Promise<JiraUserSearchResult[]> {
    const url = userSearchUrl(this.baseUrl);
    const res = await this.http.get(url, {
      params: {
        username: query,
        maxResults,
      },
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeUserSearchResponse(res.data);
  }

  async getEditMeta(issueKey: string): Promise<JiraEditMetaResult> {
    const url = issueEditMetaUrl(this.baseUrl, issueKey);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeEditMetaResponse(issueKey, res.data);
  }

  async transitionIssue(
    issueKey: string,
    payload: {
      transition: { id: string };
      update?: Record<string, unknown>;
      fields?: Record<string, unknown>;
    }
  ): Promise<void> {
    const url = issueTransitionsUrl(this.baseUrl, issueKey);
    const res = await this.http.post(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  async getComments(
    issueKey: string,
    maxResults = 50
  ): Promise<JiraComment[]> {
    const url = `${issueCommentUrl(this.baseUrl, issueKey)}?maxResults=${maxResults}&orderBy=-created`;
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const data = res.data as { comments?: unknown[] };
    if (!data || !Array.isArray(data.comments)) {
      throw jiraResponseError("Unexpected get comments response shape", data);
    }

    return (data.comments as Array<Record<string, unknown>>).map((raw) => ({
      id: String(raw.id ?? ""),
      author: (raw.author as { displayName?: string } | undefined)?.displayName ?? null,
      body: typeof raw.body === "string" ? raw.body : null,
      created: String(raw.created ?? ""),
      updated: String(raw.updated ?? ""),
    }));
  }

  async addComment(
    issueKey: string,
    payload: { body: unknown }
  ): Promise<JiraCommentResult> {
    const url = issueCommentUrl(this.baseUrl, issueKey);
    const res = await this.http.post(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { id?: string };
    if (!body || typeof body.id !== "string") {
      throw jiraResponseError("Unexpected add comment response shape", body);
    }

    return {
      id: body.id,
      issueKey,
      url: `${this.baseUrl}/browse/${issueKey}`,
    };
  }

  async updateComment(
    issueKey: string,
    commentId: string,
    payload: { body: unknown }
  ): Promise<JiraCommentResult> {
    const url = issueCommentByIdUrl(this.baseUrl, issueKey, commentId);
    const res = await this.http.put(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { id?: string };
    return {
      id: typeof body?.id === "string" ? body.id : commentId,
      issueKey,
      url: `${this.baseUrl}/browse/${issueKey}`,
    };
  }

  async deleteComment(issueKey: string, commentId: string): Promise<void> {
    const url = issueCommentByIdUrl(this.baseUrl, issueKey, commentId);
    const res = await this.http.delete(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  async updateIssueFields(
    issueKey: string,
    payload: { fields: Record<string, unknown> }
  ): Promise<void> {
    const url = issueUrl(this.baseUrl, issueKey);
    const res = await this.http.put(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  async linkIssues(payload: {
    type: { name: string };
    inwardIssue: { key: string };
    outwardIssue: { key: string };
    comment?: { body: unknown };
  }): Promise<JiraIssueLinkResult> {
    const url = issueLinkUrl(this.baseUrl);
    const res = await this.http.post(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { linkId?: string };
    if (!body || typeof body.linkId !== "string") {
      throw jiraResponseError("Unexpected link issue response shape", body);
    }

    return { linkId: body.linkId };
  }

  async getIssueLinks(issueKey: string): Promise<JiraIssueLinksResult> {
    const url = issueUrl(this.baseUrl, issueKey);
    const res = await this.http.get(url, {
      params: { fields: "issuelinks" },
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeIssueLinks(issueKey, res.data, this.baseUrl);
  }

  async getSubtasks(issueKey: string): Promise<JiraSubtasksResult> {
    const url = searchUrl(this.baseUrl);
    const res = await this.http.post(url, {
      jql: `parent = "${issueKey}" ORDER BY created ASC`,
      maxResults: 100,
      fields: ["summary", "status", "issuetype", "assignee", "priority"],
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const data = res.data as { issues?: unknown[] };
    if (!data || !Array.isArray(data.issues)) {
      throw jiraResponseError("Unexpected subtasks search response shape", data);
    }

    return {
      issueKey,
      subtasks: data.issues.map((item) => normalizeSubtask(item, this.baseUrl)),
    };
  }

  async createSubtask(input: JiraSubtaskInput): Promise<JiraCreatedIssueTransportResult> {
    return this.createIssue({
      fields: {
        ...input.fields,
        parent: { key: input.parentIssueKey },
        issuetype: { id: input.issueTypeId },
      },
    });
  }

  async cloneIssue(input: JiraCloneIssueInput): Promise<JiraCreatedIssueTransportResult> {
    const source = await this.getCloneSource(input.sourceIssueKey);
    const summaryPrefix = input.summaryPrefix ?? "Clone of";

    return this.createIssue({
      fields: {
        ...source.fields,
        summary: `${summaryPrefix} ${source.summary}`,
        ...(input.fields ?? {}),
      },
    });
  }

  async assignIssue(
    issueKey: string,
    payload: { name?: string; key?: string }
  ): Promise<void> {
    const url = issueAssignUrl(this.baseUrl, issueKey);
    const res = await this.http.put(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  async getMyWorklogs(input: {
    workerKey: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<TempoWorklogListItem[]> {
    const url = tempoSearchWorklogsUrl(this.baseUrl);
    const res = await this.http.post(url, {
      from: input.dateFrom,
      to: input.dateTo,
      worker: [input.workerKey],
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data;
    if (!Array.isArray(body)) {
      throw jiraResponseError("Expected array response from Tempo POST /worklogs/search", body);
    }

    return (body as TempoRawWorklog[]).map((raw) => ({
      tempoWorklogId: raw.tempoWorklogId,
      issueKey: raw.issue?.key ?? String(raw.originTaskId ?? ""),
      issueSummary: raw.issue?.summary ?? null,
      timeSpent: raw.timeSpent ?? "",
      timeSpentSeconds: raw.timeSpentSeconds ?? 0,
      startDate: raw.started ? raw.started.slice(0, 10) : "",
      comment: raw.comment ?? null,
      process: raw.attributes?._Process_?.value ?? null,
      typeOfWork: raw.attributes?._TypeOfWork_?.value ?? null,
    }));
  }

  async updateWorklog(
    worklogId: string,
    payload: Partial<TempoWorklogInput>
  ): Promise<TempoWorklogResult> {
    const url = tempoWorklogUrl(this.baseUrl, worklogId);
    const res = await this.http.put(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data;
    const worklog = Array.isArray(body) ? body[0] : body;
    if (!worklog || typeof worklog !== "object") {
      throw jiraResponseError("Unexpected Tempo update worklog response shape", body);
    }

    return worklog as TempoWorklogResult;
  }

  async deleteWorklog(worklogId: string): Promise<void> {
    const url = tempoWorklogUrl(this.baseUrl, worklogId);
    const res = await this.http.delete(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  // ---------------------------------------------------------------------------
  // Attachment download
  // ---------------------------------------------------------------------------

  /**
   * Downloads an attachment's binary content from its direct URL.
   * The URL is the `content` property from the Jira attachment metadata.
   */
  async downloadAttachment(downloadUrl: string): Promise<Buffer> {
    const res = await this.http.get(downloadUrl, {
      responseType: "arraybuffer",
    });

    this.checkForAuthFailure(res.status, downloadUrl, "");
    this.assertOk(res.status, downloadUrl, "");

    return Buffer.from(res.data as ArrayBuffer);
  }

  async addAttachment(issueKey: string, filePath: string): Promise<JiraAttachmentUploadResult[]> {
    const url = issueAttachmentUrl(this.baseUrl, issueKey);
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), basename(filePath));

    const res = await this.http.post(url, form, {
      headers: {
        "X-Atlassian-Token": "no-check",
        "Content-Type": "multipart/form-data",
      },
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeAttachmentUploadResponse(res.data);
  }

  async getProjects(): Promise<JiraProject[]> {
    const url = projectsUrl(this.baseUrl);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeProjects(res.data, this.baseUrl);
  }

  async getComponents(projectKey: string): Promise<JiraComponent[]> {
    const url = projectComponentsUrl(this.baseUrl, projectKey);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeComponents(res.data);
  }

  async getPriorities(): Promise<JiraPriority[]> {
    const url = prioritiesUrl(this.baseUrl);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizePriorities(res.data);
  }
  // ---------------------------------------------------------------------------
  // Time tracking (lightweight — for worklog remaining estimate)
  // ---------------------------------------------------------------------------

  /**
   * Fetches only the `remainingEstimateSeconds` for an issue.
   * Uses `?fields=timetracking` for a lightweight call.
   * Returns 0 if the field is not set.
   */
  async getIssueRemainingEstimate(issueKey: string): Promise<number> {
    const url = issueUrl(this.baseUrl, issueKey) + "?fields=timetracking";
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as {
      fields?: {
        timetracking?: { remainingEstimateSeconds?: number };
      };
    };

    return body?.fields?.timetracking?.remainingEstimateSeconds ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Current user (for Tempo worker key)
  // ---------------------------------------------------------------------------

  /**
   * Fetches the currently authenticated Jira user.
   * Used to obtain the `key` field required as `worker` by the Tempo API.
   */
  async getCurrentUser(): Promise<JiraCurrentUser> {
    const url = myselfUrl(this.baseUrl);
    const res = await this.http.get(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    const body = res.data as { key?: string; name?: string; displayName?: string };
    if (!body || typeof body.key !== "string" || typeof body.name !== "string") {
      throw jiraResponseError("Unexpected /myself response shape", body);
    }

    return {
      key: body.key,
      name: body.name,
      displayName: body.displayName ?? body.name,
    };
  }

  // ---------------------------------------------------------------------------
  // Tempo Timesheets — create worklog
  // ---------------------------------------------------------------------------

  /**
   * Creates a worklog via the Tempo Timesheets REST API.
   * POST /rest/tempo-timesheets/4/worklogs
   */
  async createWorklog(payload: TempoWorklogInput): Promise<TempoWorklogResult[]> {
    const url = tempoCreateWorklogUrl(this.baseUrl);
    const res = await this.http.post(url, payload);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    // Tempo returns an array of created worklogs
    const body = res.data;
    if (!Array.isArray(body)) {
      throw jiraResponseError("Expected array response from Tempo POST /worklogs", body);
    }

    return body as TempoWorklogResult[];
  }

  private async getCloneSource(issueKey: string): Promise<{
    summary: string;
    fields: Record<string, unknown>;
  }> {
    const url = issueUrl(this.baseUrl, issueKey);
    const fields = [
      "project",
      "issuetype",
      "summary",
      "description",
      "priority",
      "components",
      "labels",
      "duedate",
      "fixVersions",
      "versions",
    ];
    const res = await this.http.get(url, {
      params: { fields: fields.join(",") },
    });

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);

    return normalizeCloneSource(res.data);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Detects auth failure patterns:
   * - HTTP 401 / 403
   * - 3xx redirect (Jira → SSO provider)
   * - HTML response body (Jira login page)
   */
  private checkForAuthFailure(
    status: number,
    url: string,
    body: unknown
  ): void {
    if (status === 401 || status === 403) {
      throw sessionExpired(
        `Jira returned ${status} — session likely expired. Run \`jira-auth-login\` to reauthenticate.`
      );
    }
    if (status >= 300 && status < 400) {
      throw sessionExpired(
        `Jira redirected (${status}) — session likely expired. Run \`jira-auth-login\` to reauthenticate.`
      );
    }
    if (typeof body === "string" && isLoginPage(body)) {
      throw sessionExpired(
        "Jira returned a login page — session has expired. Run `jira-auth-login` to reauthenticate."
      );
    }
  }

  private assertOk(status: number, url: string, body: unknown): void {
    if (status < 200 || status >= 300) {
      throw jiraHttpError(status, url, typeof body === "string" ? body : undefined);
    }
  }
}

function isLoginPage(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.startsWith("<!") &&
    (lower.includes("log in") || lower.includes("login") || lower.includes("sso"))
  );
}

function normalizeAttachmentUploadResponse(raw: unknown): JiraAttachmentUploadResult[] {
  if (!Array.isArray(raw)) {
    throw jiraResponseError("Unexpected attachment upload response shape", raw);
  }

  return raw.map((item) => {
    const record = item as {
      id?: unknown;
      filename?: unknown;
      size?: unknown;
      mimeType?: unknown;
      content?: unknown;
    };
    if (typeof record.id !== "string" || typeof record.filename !== "string") {
      throw jiraResponseError("Unexpected attachment item response shape", item);
    }

    return {
      id: record.id,
      filename: record.filename,
      size: typeof record.size === "number" ? record.size : 0,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : null,
      url: typeof record.content === "string" ? record.content : null,
    };
  });
}

function normalizeProjects(raw: unknown, baseUrl: string): JiraProject[] {
  if (!Array.isArray(raw)) {
    throw jiraResponseError("Unexpected projects response shape", raw);
  }

  return raw.map((item) => {
    const record = item as { id?: unknown; key?: unknown; name?: unknown; self?: unknown };
    if (typeof record.key !== "string" || typeof record.name !== "string") {
      throw jiraResponseError("Unexpected project response item shape", item);
    }

    return {
      id: typeof record.id === "string" ? record.id : null,
      key: record.key,
      name: record.name,
      url: `${baseUrl}/projects/${record.key}`,
    };
  });
}

function normalizeComponents(raw: unknown): JiraComponent[] {
  if (!Array.isArray(raw)) {
    throw jiraResponseError("Unexpected components response shape", raw);
  }

  return raw.map((item) => {
    const record = item as { id?: unknown; name?: unknown; description?: unknown };
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      throw jiraResponseError("Unexpected component response item shape", item);
    }

    return {
      id: record.id,
      name: record.name,
      description: typeof record.description === "string" ? record.description : null,
    };
  });
}

function normalizePriorities(raw: unknown): JiraPriority[] {
  if (!Array.isArray(raw)) {
    throw jiraResponseError("Unexpected priorities response shape", raw);
  }

  return raw.map((item) => {
    const record = item as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      iconUrl?: unknown;
    };
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      throw jiraResponseError("Unexpected priority response item shape", item);
    }

    return {
      id: record.id,
      name: record.name,
      description: typeof record.description === "string" ? record.description : null,
      iconUrl: typeof record.iconUrl === "string" ? record.iconUrl : null,
    };
  });
}

function normalizeIssueLinks(
  issueKey: string,
  raw: unknown,
  baseUrl: string
): JiraIssueLinksResult {
  const body = raw as { fields?: { issuelinks?: unknown } };
  const links = body.fields?.issuelinks;
  if (!Array.isArray(links)) {
    throw jiraResponseError("Unexpected issue links response shape", raw);
  }

  return {
    issueKey,
    links: links.map((link) => normalizeIssueLink(link, baseUrl)),
  };
}

function normalizeIssueLink(raw: unknown, baseUrl: string) {
  const link = raw as {
    id?: unknown;
    type?: { name?: unknown; inward?: unknown; outward?: unknown };
    inwardIssue?: unknown;
    outwardIssue?: unknown;
  };
  const isInward = link.inwardIssue != null;
  const linkedIssue = isInward ? link.inwardIssue : link.outwardIssue;
  const issue = linkedIssue as {
    key?: unknown;
    fields?: {
      summary?: unknown;
      status?: { name?: unknown };
      issuetype?: { name?: unknown };
    };
  };

  if (typeof link.id !== "string" || typeof issue?.key !== "string") {
    throw jiraResponseError("Unexpected issue link response item shape", raw);
  }

  return {
    id: link.id,
    type: typeof link.type?.name === "string" ? link.type.name : "Unknown",
    direction: isInward ? ("inward" as const) : ("outward" as const),
    relationship:
      isInward && typeof link.type?.inward === "string"
        ? link.type.inward
        : !isInward && typeof link.type?.outward === "string"
          ? link.type.outward
          : "linked",
    issueKey: issue.key,
    summary: typeof issue.fields?.summary === "string" ? issue.fields.summary : "",
    status: typeof issue.fields?.status?.name === "string" ? issue.fields.status.name : "",
    issueType: typeof issue.fields?.issuetype?.name === "string" ? issue.fields.issuetype.name : "",
    url: `${baseUrl}/browse/${issue.key}`,
  };
}

function normalizeSubtasks(issueKey: string, raw: unknown, baseUrl: string): JiraSubtasksResult {
  const body = raw as { fields?: { subtasks?: unknown } };
  const subtasks = body.fields?.subtasks;
  if (!Array.isArray(subtasks)) {
    throw jiraResponseError("Unexpected subtasks response shape", raw);
  }

  return {
    issueKey,
    subtasks: subtasks.map((subtask) => normalizeSubtask(subtask, baseUrl)),
  };
}

function normalizeSubtask(raw: unknown, baseUrl: string) {
  const subtask = raw as {
    key?: unknown;
    fields?: {
      summary?: unknown;
      status?: { name?: unknown };
      issuetype?: { name?: unknown };
      assignee?: { displayName?: unknown } | null;
      priority?: { name?: unknown } | null;
    };
  };

  if (typeof subtask.key !== "string") {
    throw jiraResponseError("Unexpected subtask response item shape", raw);
  }

  return {
    key: subtask.key,
    summary: typeof subtask.fields?.summary === "string" ? subtask.fields.summary : "",
    status: typeof subtask.fields?.status?.name === "string" ? subtask.fields.status.name : "",
    issueType:
      typeof subtask.fields?.issuetype?.name === "string" ? subtask.fields.issuetype.name : "",
    assignee:
      typeof subtask.fields?.assignee?.displayName === "string"
        ? subtask.fields.assignee.displayName
        : null,
    priority:
      typeof subtask.fields?.priority?.name === "string" ? subtask.fields.priority.name : null,
    url: `${baseUrl}/browse/${subtask.key}`,
  };
}

function normalizeCloneSource(raw: unknown): { summary: string; fields: Record<string, unknown> } {
  const body = raw as { fields?: Record<string, unknown> };
  if (!body.fields || typeof body.fields !== "object") {
    throw jiraResponseError("Unexpected clone source response shape", raw);
  }

  const fields = { ...body.fields };
  const summary = typeof fields.summary === "string" ? fields.summary : "";

  delete fields.attachment;
  delete fields.comment;
  delete fields.issuelinks;
  delete fields.subtasks;
  delete fields.status;
  delete fields.resolution;

  return { summary, fields };
}
