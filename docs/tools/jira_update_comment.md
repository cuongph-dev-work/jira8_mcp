# jira_update_comment

Update an existing Jira issue comment.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `commentId` | `string` | yes | Jira comment id |
| `body` | `string \| ADF object` | yes | Replacement body as plain text or raw ADF |

## Behavior

- Sends `PUT /rest/api/2/issue/{issueKey}/comment/{commentId}`
- Plain text is normalized to a minimal ADF document before sending
- Raw ADF is forwarded unchanged after basic validation

## Output

Markdown confirmation with issue key, comment id, and browser URL.
