# jira_bulk_update_issue_fields

Update fields on multiple issues with explicit dry-run control.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dryRun` | `boolean` | yes | `true` previews only; `false` applies updates |
| `issues` | `array` | yes | 1-25 issue update requests |

Each issue item contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `fields` | `object` | yes | Curated update fields |

## Behavior

- Requires explicit `dryRun`
- Normalizes each payload through the same allowlist as `jira_update_issue_fields`
- Continues processing after per-issue failures
- Calls Jira update only when `dryRun` is `false`

## Output

Markdown table with per-issue status.
