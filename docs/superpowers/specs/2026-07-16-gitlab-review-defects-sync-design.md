# GitLab Review Defects Sync — Design

## Goal

Add MCP tool `jira_sync_gitlab_review_defects` that, for a Jira project key, reads configured GitLab repositories, collects top-level review comments from **open** merge requests, and creates Jira **Review Defect** issues (`ISSUE_TYPE.REVIEW_DEFECT` = `10805`).

## Requirements

1. Trigger input is a Jira `projectKey`.
2. GitLab links are configured in `.jira/gitlab-projects.json` (custom base URL; multiple repos per project).
3. Authenticate to GitLab with `GITLAB_TOKEN` from the process environment.
4. Only process merge requests with `state=opened`.
5. Only process **top-level** human discussion notes; ignore replies and system notes.
6. Deduplicate with both Jira search (note id marker / external id) and a local store `.jira/gitlab-review-defects.json`.
7. Default `dryRun: true`; create only when `dryRun: false`.
8. Per Review Defect:
   - **Assignee** = MR author → `{username}@runsystem.net` → Jira user lookup
   - **Reporter** = comment author → same email rule → Jira user lookup
   - **Due date** = comment `created_at` date (`YYYY-MM-DD`)
9. If assignee/reporter lookup fails: return `needsUserMapping` and accept `userOverrides` on a subsequent call. Do not create until both users resolve.

## Architecture

Orchestrator tool over a thin GitLab HTTP client, reusing existing Jira session, `findUsers`, `searchIssues`, and `createIssue`.

| Layer | Responsibility |
|-------|----------------|
| `src/tools/sync-gitlab-review-defects.ts` | Zod input, auth gate, orchestration, markdown result |
| `src/gitlab/` | Token HTTP client, open MRs, discussions, note filtering |
| `src/jira/gitlab-project-map.ts` | Load/validate project → GitLab links |
| `src/jira/gitlab-review-dedup-store.ts` | Local processed-id store |
| Existing `src/jira/` | Session, create issue, user search, JQL |

## Tool contract

```ts
{
  projectKey: string;
  dryRun?: boolean; // default true
  userOverrides?: Record<string, string>; // gitlabUsername → jira username or email
}
```

**Output buckets:** `candidates` | `created` | `skippedDuplicate` | `needsUserMapping` | `failed`.

**Dedup key:** `{gitlabBaseUrl}|{projectPath}|{mrIid}|{noteId}`

**Jira marker:** `gitlab-note-id: <dedupKey>` in description; also set `customfield_10747` (`EXTERNAL_ISSUE_ID`) when create accepts it.

**User resolution order:** `userOverrides[gitlabUsername]` → `{username}@runsystem.net` → `findUsers` → exact email/username match; else `needsUserMapping`.

## Config

### `.jira/gitlab-projects.json`

```json
{
  "PROJ": [
    {
      "gitlabBaseUrl": "https://gitlab.example.com",
      "projectPath": "group/app-frontend"
    }
  ]
}
```

### Environment

- `GITLAB_TOKEN` — required by the tool (optional at server boot)
- Existing `JIRA_BASE_URL` and Jira session cookies

## Data flow

1. Load GitLab links for `projectKey`; error if none.
2. For each link: list open MRs.
3. For each MR: fetch discussions; keep first note of each discussion when human (not system); ignore replies.
4. Skip if dedup key exists in Jira JQL or local store.
5. Resolve assignee (MR author) and reporter (comment author).
6. Unresolved → `needsUserMapping`.
7. `dryRun=true` → list candidates. `dryRun=false` → create Review Defects and append local store.

## Errors

| Case | Behavior |
|------|----------|
| Missing `GITLAB_TOKEN` | `CONFIG_ERROR` |
| No mapping for project | Clear config error |
| GitLab 401/403 | Auth error with token guidance |
| Jira session expired | `SESSION_EXPIRED` |
| Partial apply failures | Summarize created / skipped / needs mapping / failed |

## Out of scope

- Webhooks / cron sync
- Closed or merged MRs
- Creating issues for reply notes
- Auto-linking to a parent Jira story
- Per-host GitLab tokens (single `GITLAB_TOKEN`)

## Alternatives considered

1. **Orchestrator tool (chosen)** — one MCP call matches the agent workflow.
2. **Split list + create tools** — pushes dedup/apply loop into the agent; higher duplicate risk.
3. **Background CLI only** — outside MCP; not requested.
