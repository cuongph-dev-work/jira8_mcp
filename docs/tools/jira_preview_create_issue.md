# jira_preview_create_issue

Build and validate a create issue payload without sending it to Jira.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueTypeId` | `string` | yes | Jira issue type id from `src/jira/constants.ts` |
| `fields` | `object` | yes | Jira create fields |

## Behavior

- Uses the same validation and normalization as `jira_create_issue`
- Converts plain-text description to ADF
- Does not load a session and does not call Jira

## Output

Markdown summary plus normalized create payload JSON.
