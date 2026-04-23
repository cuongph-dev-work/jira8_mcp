# jira_create_issue

Create a Jira issue through the internal Jira 8 REST API.

## When to Use

- User asks to create a new Jira ticket
- The issue type is known up front (Task, Bug, Story, Change Request, Risk, etc.)
- Required and optional fields should follow the metadata in `src/jira/constants.ts`

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueTypeId` | `string` | ✅ | Jira issue type ID from `ISSUE_TYPE` in `src/jira/constants.ts` |
| `fields` | `Record<string, unknown>` | ✅ | Jira create payload fields keyed by standard field names (`FIELD.*`) or custom field IDs (`CUSTOM_FIELD.*`) |

### Description Support

`fields.description` supports two forms:

- `string`: server automatically converts it to a minimal ADF document before sending to Jira
- ADF JSON object: server validates the basic ADF document shape and forwards it unchanged

### Validation Rules

- `issueTypeId` must be one of the IDs in `ISSUE_TYPE`
- `fields` must contain every ID in `REQUIRED_FIELDS[issueTypeId]`, except `issuetype`
- `fields` may only contain IDs from the issue type's allowlist:
  - required IDs from `REQUIRED_FIELDS[issueTypeId]`
  - optional IDs from `OPTIONAL_FIELDS[issueTypeId]`
- Do not pass `issuetype` in `fields`; the tool injects it from `issueTypeId`
- If `fields.description` is present, it must be either a `string` or a valid ADF document object

## Output

Returns a markdown confirmation with:

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Created Jira issue key |
| `summary` | `string` | Summary taken from `fields.summary` |
| `issueType` | `string` | Human-readable issue type label |
| `url` | `string` | Browser URL to the created issue |

## Error Cases

| Error Code | Meaning | Action |
|------------|---------|--------|
| `INVALID_INPUT` | Missing required fields or unsupported fields for the selected issue type | Fix the payload |
| `AUTH_REQUIRED` | No session file found | Run `npm run jira-auth-login` |
| `SESSION_EXPIRED` | Session cookies expired | Run `npm run jira-auth-login` |
| `JIRA_HTTP_ERROR` | Jira returned non-2xx during create | Check payload and Jira response |
| `JIRA_RESPONSE_ERROR` | Jira returned an unexpected response shape | Report to maintainer |

All errors return `isError: true` in the MCP response.

## Examples

### Create a Task

```json
{
  "name": "jira_create_issue",
  "arguments": {
    "issueTypeId": "10000",
    "fields": {
      "project": { "key": "DNIEM" },
      "summary": "Implement jira_create_issue MCP tool",
      "customfield_12100": { "id": "12701" },
      "customfield_10339": [{ "id": "10083" }],
      "duedate": "2026-04-30",
      "description": "Minimal Task payload with an optional description"
    }
  }
}
```

The payload above is sent to Jira with `description` normalized to:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Minimal Task payload with an optional description" }
      ]
    }
  ]
}
```

### Create a Bug

```json
{
  "name": "jira_create_issue",
  "arguments": {
    "issueTypeId": "10202",
    "fields": {
      "project": { "key": "DNIEM" },
      "summary": "Login redirect loops after SSO callback",
      "customfield_10339": [{ "id": "10083" }],
      "customfield_10335": { "id": "10059" },
      "duedate": "2026-04-30",
      "customfield_10323": { "id": "10070" },
      "description": "Observed in staging after the latest deploy"
    }
  }
}
```

### Example output

```markdown
# Created issue DNIEM-42

**Summary:** Implement jira_create_issue MCP tool
**Type:** Task
**URL:** https://jira.yourcompany.com/browse/DNIEM-42
```
