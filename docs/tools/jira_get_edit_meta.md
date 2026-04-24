# jira_get_edit_meta

Return live editable fields for a specific issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |

## Behavior

- Sends `GET /rest/api/2/issue/{issueKey}/editmeta`
- Normalizes field ids, labels, required flags, schema types, and allowed values
- Use this before updating fields when editability is issue-specific

## Output

Markdown table of editable fields and allowed values.
