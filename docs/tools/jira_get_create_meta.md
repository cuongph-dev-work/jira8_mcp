# jira_get_create_meta

Return static create metadata for Jira issue types from `src/jira/constants.ts`.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueTypeId` | `string` | ❌ | Optional issue type id to narrow the result |

## Output

Markdown listing issue types, required fields, optional fields, and known option sets for supported fields.
