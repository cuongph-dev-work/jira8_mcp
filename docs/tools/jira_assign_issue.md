# jira_assign_issue

Assign a Jira issue to a user.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |
| `assigneeName` | `string` | ❌ | Jira username/name |
| `assigneeKey` | `string` | ❌ | Jira internal user key |

Provide exactly one of `assigneeName` or `assigneeKey`.

## Output

Markdown confirmation with issue key, assignee, and browser URL.
