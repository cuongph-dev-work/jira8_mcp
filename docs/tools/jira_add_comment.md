# jira_add_comment

Add a comment to a Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |
| `body` | `string \| ADF object` | ✅ | Comment body as plain text or raw ADF document |

## Behavior

- Plain text is normalized to a minimal ADF document before sending to Jira
- Raw ADF is forwarded unchanged after basic validation

## Output

Markdown confirmation with issue key, comment id, and browser URL.
