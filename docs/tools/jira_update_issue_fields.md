# jira_update_issue_fields

Update a curated set of fields on an existing Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |
| `fields` | `object` | ✅ | Curated set of updateable fields |

## Behavior

- Only a safe allowlist of fields is accepted in v1
- `fields.description` accepts plain text or raw ADF
- Plain text descriptions are normalized to ADF before the request is sent

## Output

Markdown confirmation with issue key, updated field ids, and browser URL.
