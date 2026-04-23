import axios, { type AxiosInstance } from "axios";
import {
  issueUrl,
  searchUrl,
  ISSUE_FIELDS,
  SEARCH_FIELDS,
} from "./endpoints.js";
import { mapIssue, mapIssueSummary } from "./mappers.js";
import { jiraHttpError, jiraResponseError, sessionExpired } from "../errors.js";
import type { JiraIssue, JiraSearchResult, SessionCookies } from "../types.js";

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
