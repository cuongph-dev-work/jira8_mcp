import axios, { type AxiosInstance } from "axios";
import { configError, jiraHttpError, jiraResponseError } from "../errors.js";
import type {
  GitlabRawDiscussion,
  GitlabRawMergeRequest,
} from "../types/gitlab-api.js";
import {
  mergeRequestDiscussionsUrl,
  mergeRequestUrl,
  mergeRequestsUrl,
} from "./endpoints.js";

export type GitlabMrState = "opened" | "merged" | "closed";

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
      maxRedirects: 0,
      validateStatus: () => true,
    });
  }

  /** List merge requests filtered by GitLab state (opened | merged | closed). */
  async listMergeRequests(
    projectPath: string,
    state: GitlabMrState
  ): Promise<GitlabRawMergeRequest[]> {
    const url = mergeRequestsUrl(this.baseUrl, projectPath);
    const all: GitlabRawMergeRequest[] = [];
    let page = 1;

    for (;;) {
      const res = await this.http.get(url, {
        params: {
          state,
          per_page: 100,
          page,
        },
      });

      this.assertOk(res.status, url, res.data);

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
    const res = await this.http.get(url);
    this.assertOk(res.status, url, res.data);

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
      const res = await this.http.get(url, {
        params: {
          per_page: 100,
          page,
        },
      });

      this.assertOk(res.status, url, res.data);

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

  private assertOk(status: number, url: string, body: unknown): void {
    if (status >= 200 && status < 300) return;
    const text = typeof body === "string" ? body : JSON.stringify(body);
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
