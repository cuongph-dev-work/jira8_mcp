# jira_add_attachment

Upload a local workspace file to a Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `filePath` | `string` | yes | Local file path inside the current workspace |

## Behavior

- Rejects files outside the current workspace
- Sends `POST /rest/api/2/issue/{issueKey}/attachments`
- Uses Jira's required `X-Atlassian-Token: no-check` header

## Output

Markdown table with uploaded attachment filenames, sizes, and ids.
