import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import {
  GitlabHttpClient,
  type GitlabMrState,
} from "../gitlab/http-client.js";
import {
  buildGitlabNoteUrl,
  extractTopLevelReviewComments,
  type GitlabReviewCommentCandidate,
} from "../gitlab/mappers.js";
import { ISSUE_TYPE } from "../jira/constants.js";
import {
  buildCreateIssuePayload,
  createIssueFromFields,
} from "../jira/create-issue.js";
import {
  buildReviewDefectFields,
  DEFAULT_REVIEW_DEFECT_PROJECT_STAGE,
  GITLAB_NOTE_ID_MARKER_PREFIX,
  REVIEW_DEFECT_PROJECT_STAGE_KEYS,
  type ReviewDefectProjectStageKey,
} from "../jira/gitlab-review-defect.js";
import {
  loadGitlabProjectLinks,
  type GitlabProjectLink,
} from "../jira/gitlab-project-map.js";
import {
  appendGitlabReviewDedupIds,
  loadGitlabReviewDedupStore,
} from "../jira/gitlab-review-dedup-store.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { escapeJqlString, navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { GitlabRawMergeRequest } from "../types/gitlab-api.js";
import type { JiraUserSearchResult } from "../types.js";

export const GITLAB_JIRA_EMAIL_DOMAIN = "runsystem.net";
export const GITLAB_MR_STATES = ["opened", "merged", "closed"] as const;

const reviewDefectProjectStageEnum = REVIEW_DEFECT_PROJECT_STAGE_KEYS as [
  ReviewDefectProjectStageKey,
  ...ReviewDefectProjectStageKey[],
];

export { reviewDefectProjectStageEnum };

export const syncGitlabReviewDefectsSchema = z.object({
  projectKey: z.string().min(1, "projectKey is required"),
  /** Which MRs to scan when mrIid is omitted. Default: merged. */
  mrState: z.enum(GITLAB_MR_STATES).optional().default("merged"),
  /** When set, process only this one MR IID (searched across configured GitLab links). */
  mrIid: z.number().int().positive().optional(),
  dryRun: z.boolean().optional().default(true),
  userOverrides: z.record(z.string()).optional().default({}),
  /** Jira Project Stages (`customfield_10339`). Default: CODING. */
  projectStage: z
    .enum(reviewDefectProjectStageEnum)
    .optional()
    .default(DEFAULT_REVIEW_DEFECT_PROJECT_STAGE),
});

export type SyncGitlabReviewDefectsInput = z.infer<typeof syncGitlabReviewDefectsSchema>;

interface NeedsUserMapping {
  candidate: GitlabReviewCommentCandidate;
  missingRoles: Array<"assignee" | "reporter">;
  attempted: {
    assigneeQuery: string;
    reporterQuery: string;
  };
}

interface ResolvedCandidate {
  candidate: GitlabReviewCommentCandidate;
  assigneeName: string;
  reporterName: string;
}

export async function handleSyncGitlabReviewDefects(
  rawInput: unknown,
  cfg: Config,
  options?: {
    gitlabProjectsFile?: string;
    gitlabDedupFile?: string;
  }
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = syncGitlabReviewDefectsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { projectKey, mrState, mrIid, dryRun, userOverrides, projectStage } = parsed.data;
  const token = cfg.GITLAB_TOKEN?.trim();
  if (!token) {
    return errorContent(
      `[CONFIG_ERROR] GITLAB_TOKEN is required. Export GITLAB_TOKEN in your environment.`
    );
  }

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const links = await loadGitlabProjectLinks(projectKey, options?.gitlabProjectsFile);
    const jira = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const localDedup = await loadGitlabReviewDedupStore(options?.gitlabDedupFile);
    const userCache = new Map<string, JiraUserSearchResult | null>();

    const candidates: GitlabReviewCommentCandidate[] = [];
    const failed: string[] = [];

    const collected = await collectReviewComments({
      links,
      token,
      mrState,
      mrIid,
    });
    candidates.push(...collected.candidates);
    failed.push(...collected.failed);

    const skippedDuplicate: GitlabReviewCommentCandidate[] = [];
    const pending: GitlabReviewCommentCandidate[] = [];

    for (const candidate of candidates) {
      const isLocalDup = localDedup.has(candidate.dedupKey);
      const isJiraDup = await isAlreadyInJira(jira, projectKey, candidate);
      if (isLocalDup || isJiraDup) {
        skippedDuplicate.push(candidate);
      } else {
        pending.push(candidate);
      }
    }

    const needsUserMapping: NeedsUserMapping[] = [];
    const resolved: ResolvedCandidate[] = [];

    for (const candidate of pending) {
      const assigneeQuery = resolveQuery(candidate.mrAuthorUsername, userOverrides);
      const reporterQuery = resolveQuery(candidate.commentAuthorUsername, userOverrides);
      const assignee = await resolveJiraUser(jira, assigneeQuery, userCache);
      const reporter = await resolveJiraUser(jira, reporterQuery, userCache);

      const missingRoles: Array<"assignee" | "reporter"> = [];
      if (!assignee?.name) missingRoles.push("assignee");
      if (!reporter?.name) missingRoles.push("reporter");

      if (missingRoles.length > 0) {
        needsUserMapping.push({
          candidate,
          missingRoles,
          attempted: { assigneeQuery, reporterQuery },
        });
        continue;
      }

      resolved.push({
        candidate,
        assigneeName: assignee!.name!,
        reporterName: reporter!.name!,
      });
    }

    const created: Array<{ key: string; url: string; dedupKey: string }> = [];
    const createFailed: string[] = [...failed];

    if (!dryRun) {
      const newlyCreatedIds: string[] = [];
      for (const item of resolved) {
        try {
          const fields = buildReviewDefectFields(projectKey, item, projectStage);
          const result = await createIssueFromFields(
            jira,
            cfg.JIRA_BASE_URL,
            ISSUE_TYPE.REVIEW_DEFECT,
            fields
          );
          created.push({
            key: result.key,
            url: result.url,
            dedupKey: item.candidate.dedupKey,
          });
          newlyCreatedIds.push(item.candidate.dedupKey);
        } catch (err: unknown) {
          createFailed.push(formatErr(`create ${item.candidate.dedupKey}`, err));
        }
      }
      await appendGitlabReviewDedupIds(newlyCreatedIds, options?.gitlabDedupFile);
    }

    const text = formatResult({
      projectKey,
      mrState,
      mrIid,
      dryRun,
      projectStage,
      resolved,
      created,
      skippedDuplicate,
      needsUserMapping,
      failed: createFailed,
    });

    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      if (err.code === "CONFIG_ERROR") {
        return errorContent(`[CONFIG_ERROR] ${err.message}`);
      }
      return errorContent(`[${err.code}] ${err.message}`);
    }
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

async function collectReviewComments(input: {
  links: GitlabProjectLink[];
  token: string;
  mrState: GitlabMrState;
  mrIid?: number;
}): Promise<{ candidates: GitlabReviewCommentCandidate[]; failed: string[] }> {
  const candidates: GitlabReviewCommentCandidate[] = [];
  const failed: string[] = [];

  for (const link of input.links) {
    const gitlab = new GitlabHttpClient(link.gitlabBaseUrl, input.token);
    try {
      const mrs = await resolveMergeRequests(gitlab, link.projectPath, input.mrState, input.mrIid);
      for (const mr of mrs) {
        if (typeof mr.iid !== "number") continue;
        try {
          const discussions = await gitlab.listMergeRequestDiscussions(
            link.projectPath,
            mr.iid
          );
          candidates.push(
            ...extractTopLevelReviewComments({
              name: link.name,
              gitlabBaseUrl: link.gitlabBaseUrl,
              projectPath: link.projectPath,
              mr,
              discussions,
            })
          );
        } catch (err: unknown) {
          failed.push(formatErr(`MR !${mr.iid} (${link.projectPath})`, err));
        }
      }
    } catch (err: unknown) {
      // For single-MR mode, 404 on one link is normal when multiple repos are configured.
      if (input.mrIid != null && isNotFound(err)) {
        continue;
      }
      failed.push(formatErr(`project ${link.projectPath}`, err));
    }
  }

  if (input.mrIid != null && candidates.length === 0 && failed.length === 0) {
    failed.push(
      `MR !${input.mrIid} not found in any configured GitLab project for this Jira projectKey`
    );
  }

  return { candidates, failed };
}

async function resolveMergeRequests(
  gitlab: GitlabHttpClient,
  projectPath: string,
  mrState: GitlabMrState,
  mrIid?: number
): Promise<GitlabRawMergeRequest[]> {
  if (mrIid != null) {
    const mr = await gitlab.getMergeRequest(projectPath, mrIid);
    return [mr];
  }
  return gitlab.listMergeRequests(projectPath, mrState);
}

function isNotFound(err: unknown): boolean {
  if (!isMcpError(err)) return false;
  const details = err.details as { status?: number } | undefined;
  return details?.status === 404;
}

export function resolveQuery(
  gitlabUsername: string,
  userOverrides: Record<string, string>
): string {
  const override = userOverrides[gitlabUsername]?.trim();
  if (override) return override;
  return `${gitlabUsername}@${GITLAB_JIRA_EMAIL_DOMAIN}`;
}

export async function resolveJiraUser(
  jira: Pick<JiraHttpClient, "findUsers">,
  query: string,
  cache: Map<string, JiraUserSearchResult | null>
): Promise<JiraUserSearchResult | null> {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  const users = await jira.findUsers(query, 20);
  const exact =
    users.find(
      (u) =>
        (u.emailAddress != null && u.emailAddress.toLowerCase() === key) ||
        (u.name != null && u.name.toLowerCase() === key)
    ) ?? null;

  cache.set(key, exact);
  return exact;
}

async function isAlreadyInJira(
  jira: Pick<JiraHttpClient, "searchIssues">,
  projectKey: string,
  candidate: GitlabReviewCommentCandidate
): Promise<boolean> {
  const noteUrl = buildGitlabNoteUrl(
    candidate.gitlabBaseUrl,
    candidate.projectPath,
    candidate.mrIid,
    candidate.noteId
  );
  const markers = [
    `${GITLAB_NOTE_ID_MARKER_PREFIX} ${noteUrl}`,
    `${GITLAB_NOTE_ID_MARKER_PREFIX} ${candidate.dedupKey}`,
  ];
  for (const marker of markers) {
    const jql = `project = ${projectKey} AND issuetype = ${ISSUE_TYPE.REVIEW_DEFECT} AND text ~ "${escapeJqlString(marker)}"`;
    try {
      const result = await jira.searchIssues(jql, 1);
      if (result.total > 0) return true;
    } catch {
      // try next marker format
    }
  }
  return false;
}

function formatResult(input: {
  projectKey: string;
  mrState: GitlabMrState;
  mrIid?: number;
  dryRun: boolean;
  projectStage: ReviewDefectProjectStageKey;
  resolved: ResolvedCandidate[];
  created: Array<{ key: string; url: string; dedupKey: string }>;
  skippedDuplicate: GitlabReviewCommentCandidate[];
  needsUserMapping: NeedsUserMapping[];
  failed: string[];
}): string {
  const scope =
    input.mrIid != null
      ? `single MR !${input.mrIid}`
      : `mrState=${input.mrState}`;
  const lines: string[] = [
    `# GitLab → Review Defect sync (${input.projectKey})`,
    "",
    `**Mode:** ${input.dryRun ? "dryRun (preview only)" : "apply (created issues)"}`,
    `**Scope:** ${scope}`,
    `**Project stage:** ${input.projectStage}`,
    "",
  ];

  if (input.dryRun) {
    lines.push(`## Candidates (${input.resolved.length})`, "");
    if (input.resolved.length === 0) {
      lines.push("_None ready to create._", "");
    } else {
      for (const item of input.resolved) {
        lines.push(
          formatCandidateBullet(input.projectKey, item, input.dryRun, input.projectStage)
        );
      }
      lines.push("");
    }
  } else {
    lines.push(`## Created (${input.created.length})`, "");
    if (input.created.length === 0) {
      lines.push("_No issues created._", "");
    } else {
      for (const c of input.created) {
        lines.push(`- **${c.key}** — ${c.url}`);
      }
      lines.push("");
    }
  }

  lines.push(`## Skipped duplicates (${input.skippedDuplicate.length})`, "");
  if (input.skippedDuplicate.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const c of input.skippedDuplicate) {
      lines.push(`- \`${c.dedupKey}\` — MR !${c.mrIid}`);
    }
    lines.push("");
  }

  lines.push(`## Needs user mapping (${input.needsUserMapping.length})`, "");
  if (input.needsUserMapping.length === 0) {
    lines.push("_None._", "");
  } else {
    lines.push(
      "Ask the user for Jira username/email overrides, then re-call with `userOverrides`.",
      ""
    );
    for (const item of input.needsUserMapping) {
      const c = item.candidate;
      lines.push(
        `- MR !${c.mrIid} note ${c.noteId}: missing **${item.missingRoles.join(", ")}**`,
        `  - assignee tried: \`${item.attempted.assigneeQuery}\` (GitLab \`${c.mrAuthorUsername}\`)`,
        `  - reporter tried: \`${item.attempted.reporterQuery}\` (GitLab \`${c.commentAuthorUsername}\`)`,
        `  - preview: ${c.body.replace(/\s+/g, " ").slice(0, 120)}`,
        `  - MR: ${c.mrUrl}`
      );
    }
    lines.push("");
  }

  lines.push(`## Failed (${input.failed.length})`, "");
  if (input.failed.length === 0) {
    lines.push("_None._");
  } else {
    for (const f of input.failed) {
      lines.push(`- ${f}`);
    }
  }

  const hints: string[] = [];
  if (input.needsUserMapping.length > 0) {
    hints.push(
      `\`jira_sync_gitlab_review_defects({projectKey: "${input.projectKey}", dryRun: true, userOverrides: {"gitlabUser": "jira.user"}})\` after collecting overrides`
    );
  }
  if (input.dryRun && input.resolved.length > 0) {
    const scopeArgs =
      input.mrIid != null
        ? `, mrIid: ${input.mrIid}`
        : `, mrState: "${input.mrState}"`;
    hints.push(
      `\`jira_sync_gitlab_review_defects({projectKey: "${input.projectKey}", dryRun: false${scopeArgs}})\` after user confirms`
    );
  }
  if (hints.length === 0) {
    hints.push(
      `\`jira_search_issues({jql: "project = ${input.projectKey} AND issuetype = 10805 ORDER BY created DESC", limit: 10})\` to list Review Defects`
    );
  }

  return lines.join("\n") + navigationHint(...hints);
}

function formatCandidateBullet(
  projectKey: string,
  item: ResolvedCandidate,
  includePayload: boolean,
  projectStage: ReviewDefectProjectStageKey
): string {
  const c = item.candidate;
  const preview = c.body.replace(/\s+/g, " ").slice(0, 100);
  const lines = [
    `- **MR !${c.mrIid}** note ${c.noteId}: ${preview}`,
    `  - assignee: ${item.assigneeName} | reporter: ${item.reporterName} | duedate: ${c.dueDate} | projectStage: ${projectStage}`,
    `  - ${c.mrUrl}`,
    `  - note: ${buildGitlabNoteUrl(c.gitlabBaseUrl, c.projectPath, c.mrIid, c.noteId)}`,
    `  - dedup: \`${c.dedupKey}\``,
  ];
  if (includePayload) {
    const fields = buildReviewDefectFields(projectKey, item, projectStage);
    const payload = buildCreateIssuePayload(ISSUE_TYPE.REVIEW_DEFECT, fields);
    lines.push("  - create payload:", "```json", JSON.stringify(payload, null, 2), "```");
  }
  return lines.join("\n");
}

function formatErr(label: string, err: unknown): string {
  if (isMcpError(err)) {
    let msg = `${label}: [${err.code}] ${err.message}`;
    if (
      err.code === "JIRA_HTTP_ERROR" &&
      err.details != null &&
      typeof err.details === "object" &&
      "body" in err.details &&
      typeof (err.details as { body?: unknown }).body === "string"
    ) {
      msg += `\n  - response: ${(err.details as { body: string }).body}`;
    }
    return msg;
  }
  if (err instanceof Error) return `${label}: ${err.message}`;
  return `${label}: ${String(err)}`;
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `[${code}] ${message}` }],
  };
}
