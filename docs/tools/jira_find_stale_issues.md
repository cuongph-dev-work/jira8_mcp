# jira_find_stale_issues

Find Jira issues that have not been updated for at least a configured number of days and are still active.

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `staleDays` | `number` | no | `30` | Minimum number of days since the last update (`1-3650`). |
| `project` | `string` | no | - | Jira project key, for example `PROJ`. |
| `status` | `string` | no | - | Exact status to include. `Cancel` and `Closed` are rejected because they are always excluded. |
| `assignee` | `string` | no | - | Assignee name/key, `me`, or `unassigned`. |
| `limit` | `number` | no | `10` | Results per page (`1-50`). |
| `startAt` | `number` | no | `0` | Zero-based pagination offset. |

## Stale rule

The tool generates a JQL query containing:

```jql
updated <= -30d AND status NOT IN ("Cancel", "Closed") ORDER BY updated ASC
```

The number of days and optional project, status, and assignee filters are added to this base query.

## Output

Returns compact Markdown with the generated JQL, threshold, total count, and a table containing:

- issue key and summary
- issue type and status
- priority and assignee
- created and updated timestamps
- issue URL

When more results are available, the output includes a navigation hint for the next page. Use `jira_get_issue` for full issue details.

## Examples

Find issues in a project that have been untouched for 60 days:

```json
{
  "name": "jira_find_stale_issues",
  "arguments": {
    "staleDays": 60,
    "project": "PROJ",
    "limit": 20
  }
}
```

Find stale issues assigned to the current user:

```json
{
  "name": "jira_find_stale_issues",
  "arguments": {
    "staleDays": 14,
    "assignee": "me"
  }
}
```
