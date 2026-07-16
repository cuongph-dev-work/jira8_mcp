# jira_sync_gitlab_review_defects

Sync top-level review comments from GitLab merge requests into Jira **Review Defect** issues (`issuetype` id `10805`).

## When to Use

1. Configure GitLab links for the Jira project in `.jira/gitlab-projects.json` (see `.jira/gitlab-projects.json.example`).
2. Export `GITLAB_TOKEN` with `read_api` (or `api`) scope.
3. Choose scope: `mrState` for many MRs, or `mrIid` for one MR.
4. Call with `dryRun: true` (default) to preview candidates.
5. If `needsUserMapping` appears, ask the user for Jira usernames/emails and re-call with `userOverrides`.
6. After confirmation, call with `dryRun: false` to create issues.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | `string` | ✅ | Jira project key (must have entries in `.jira/gitlab-projects.json`) |
| `mrState` | `"opened" \| "merged" \| "closed"` | ❌ | Default `merged`. Which MRs to scan when `mrIid` is omitted |
| `mrIid` | `number` | ❌ | Process only this one MR IID (searched across configured GitLab links). When set, `mrState` is ignored |
| `dryRun` | `boolean` | ❌ | Default `true`. Preview only when true; create when `false` |
| `userOverrides` | `Record<string, string>` | ❌ | GitLab username → Jira username or email |
| `projectStage` | `string` | ❌ | Jira Project Stages key. Default `CODING`. Examples: `BASIC_DESIGN`, `DETAIL_DESIGN`, `TEST_UT` |

## Behaviour

- Scope by `mrState` **or** a single `mrIid`
- Only **top-level** human discussion notes (ignores replies and system notes)
- Apply uses the same create-issue validation path as `jira_create_issue` / `jira_preview_create_issue` (`buildCreateIssuePayload` + `createIssueFromFields`)
- Dedup via Jira text search for `gitlab-note-id: <MR note URL>` (e.g. `…/merge_requests/93#note_1625816`) **and** `.jira/gitlab-review-defects.json`. Legacy issues with pipe-delimited dedup keys are still matched.
- Assignee = MR author (`{username}@runsystem.net` → Jira lookup)
- Reporter = comment author (same email rule)
- Due date = comment created date (`YYYY-MM-DD`)
- Project Stages (`customfield_10339`) = `CODING` by default; override with `projectStage` (e.g. `BASIC_DESIGN`)

## Output sections

- Candidates / Created
- Skipped duplicates
- Needs user mapping
- Failed

## Errors

| Case | Resolution |
|------|------------|
| Missing `GITLAB_TOKEN` | `export GITLAB_TOKEN=…` |
| No mapping for project | Edit `.jira/gitlab-projects.json` |
| Session expired | `npm run jira-auth-login` |
| GitLab 401/403 | Check token scopes |

## Examples

Scan open MRs:

```json
{
  "projectKey": "ME",
  "mrState": "opened",
  "dryRun": true
}
```

One MR:

```json
{
  "projectKey": "ME",
  "mrIid": 42,
  "dryRun": true
}
```

Closed MRs + apply with overrides:

```json
{
  "projectKey": "ME",
  "mrState": "closed",
  "dryRun": false,
  "userOverrides": {
    "thanhnn": "thanhnn@runsystem.net",
    "reviewer1": "alice.smith"
  }
}
```
