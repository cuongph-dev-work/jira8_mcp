# jira_get_transitions

List the currently available workflow transitions for a Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |

## Output

Markdown table with transition ids, names, and destination statuses.
