# jira_get_audit_context

Fetch compact issue context for LLM review.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `includeComments` | `boolean` | no | Include comments, default true |
| `maxComments` | `number` | no | Max comments, 1-100, default 20 |

## Behavior

- Fetches full issue details
- Fetches issue links
- Fetches subtasks
- Optionally fetches recent comments
- Does not write to Jira

## Output

Markdown context with issue fields, description, links, subtasks, and comments.
