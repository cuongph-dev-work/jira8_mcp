# jira_delete_worklog

Delete a Tempo worklog by id.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `worklogId` | `string` | yes | Tempo worklog id |

## Behavior

- Sends `DELETE /rest/tempo-timesheets/4/worklogs/{worklogId}`
- Returns an MCP error if Tempo rejects the deletion

## Output

Markdown confirmation with deleted Tempo id.
