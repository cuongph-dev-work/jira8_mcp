import axios, { type AxiosInstance } from "axios";
import { configError, jiraHttpError, jiraResponseError } from "../errors.js";
import type {
  GitlabRawDiscussion,
  GitlabRawMergeRequest,
} from "../types/gitlab-api.js";
import { HTTP_REQUEST_TIMEOUT_MS, isRetryableHttpStatus, withHttpRetry } from "../utils.js";
import {
  mergeRequestDiscussionsUrl,
  mergeRequestUrl,
  mergeRequestsUrl,
} from "./endpoints.js";

export type GitlabMrState = "opened" | "merged" | "closed";

export interface GitlabListMergeRequestsOptions {
  updatedAfter?: string;
  updatedBefore?: string;
}

/**
 * GitLab REST client authenticated with a personal access token.
 * Reuses McpError HTTP helpers (status/url messaging) for consistency.
 */
export class GitlabHttpClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(baseUrl: string, token: string) {
    if (!token.trim()) {
      throw configError("GITLAB_TOKEN is required. Export GITLAB_TOKEN in your environment.");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "PRIVATE-TOKEN": token,
        Accept: "application/json",
      },
      timeout: HTTP_REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: () => true,
    });
  }

  /** List merge requests filtered by GitLab state (opened | merged | closed). */
  async listMergeRequests(
    projectPath: string,
    state: GitlabMrState,
    options?: GitlabListMergeRequestsOptions
  ): Promise<GitlabRawMergeRequest[]> {
    const url = mergeRequestsUrl(this.baseUrl, projectPath);
    const all: GitlabRawMergeRequest[] = [];
    let page = 1;

    for (;;) {
      const params: Record<string, string | number> = {
        state,
        per_page: 100,
        page,
      };
      if (options?.updatedAfter != null) {
        params.updated_after = options.updatedAfter;
      }
      if (options?.updatedBefore != null) {
        params.updated_before = options.updatedBefore;
      }

      const res = await this.fetchOk(url, params);

      if (!Array.isArray(res.data)) {
        throw jiraResponseError("Unexpected GitLab merge requests response shape", res.data);
      }

      const batch = (res.data as GitlabRawMergeRequest[]).filter(
        (mr) => (mr.state ?? state) === state
      );
      all.push(...batch);
      if ((res.data as unknown[]).length < 100) break;
      page += 1;
    }

    return all;
  }

  async getMergeRequest(
    projectPath: string,
    mrIid: number
  ): Promise<GitlabRawMergeRequest> {
    const url = mergeRequestUrl(this.baseUrl, projectPath, mrIid);
    const res = await this.fetchOk(url);

    const body = res.data as GitlabRawMergeRequest;
    if (!body || typeof body.iid !== "number") {
      throw jiraResponseError("Unexpected GitLab merge request response shape", res.data);
    }
    return body;
  }

  async listMergeRequestDiscussions(
    projectPath: string,
    mrIid: number
  ): Promise<GitlabRawDiscussion[]> {
    const url = mergeRequestDiscussionsUrl(this.baseUrl, projectPath, mrIid);
    const all: GitlabRawDiscussion[] = [];
    let page = 1;

    for (;;) {
      const res = await this.fetchOk(url, {
        per_page: 100,
        page,
      });

      if (!Array.isArray(res.data)) {
        throw jiraResponseError("Unexpected GitLab discussions response shape", res.data);
      }

      const batch = res.data as GitlabRawDiscussion[];
      all.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }

    return all;
  }

  private async fetchOk(
    url: string,
    params?: Record<string, string | number>
  ): Promise<{ status: number; data: unknown }> {
    return withHttpRetry(async () => {
      const res = await this.http.get(url, { params });
      this.assertOk(res.status, url, res.data);
      return res;
    });
  }

  private assertOk(status: number, url: string, body: unknown): void {
    if (status >= 200 && status < 300) return;
    const text = typeof body === "string" ? body : JSON.stringify(body);
    if (isRetryableHttpStatus(status)) {
      throw jiraHttpError(status, url, text);
    }
    if (status === 401 || status === 403) {
      throw jiraHttpError(
        status,
        url,
        `${text}. Check GITLAB_TOKEN scopes (read_api or api).`
      );
    }
    throw jiraHttpError(status, url, text);
  }
}
