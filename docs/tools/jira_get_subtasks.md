# jira_get_subtasks

List subtasks for a Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Parent Jira issue key |

## Behavior

- Reads `subtasks` via `GET /rest/api/2/issue/{issueKey}?fields=subtasks`
- Normalizes key, summary, status, assignee, priority, and URL

## Output

Markdown table of subtasks.
