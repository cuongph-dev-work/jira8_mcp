# jira_get_my_worklogs

List the authenticated user's Tempo worklogs for an optional date range.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dateFrom` | `string` | ❌ | Start date in `yyyy-MM-dd` format |
| `dateTo` | `string` | ❌ | End date in `yyyy-MM-dd` format |

## Output

Markdown table with Tempo worklog ids, issue keys, dates, durations, and comments.
