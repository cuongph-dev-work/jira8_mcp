# jira_validate_issue_update

Validate an issue update without writing.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `fields` | `object` | yes | Curated update fields |

## Behavior

- Builds the same normalized payload as `jira_update_issue_fields`
- Reads live `editmeta` for the issue
- Reports any requested field that is not editable for the issue
- Does not call Jira update APIs

## Output

Markdown validation summary plus normalized payload JSON.
