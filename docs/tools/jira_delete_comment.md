# jira_delete_comment

Delete an existing Jira issue comment.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `commentId` | `string` | yes | Jira comment id |

## Behavior

- Sends `DELETE /rest/api/2/issue/{issueKey}/comment/{commentId}`
- Returns an MCP error if Jira rejects the deletion

## Output

Markdown confirmation with issue key and deleted comment id.
