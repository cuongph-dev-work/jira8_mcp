# jira_get_issue_history

Return the paginated changelog for a Jira issue.

## Input

| Parameter | Type | Required | Description |
|---|---|---|---|
| `issueKey` | string | yes | Jira issue key, such as `UNI-4053` |
| `startAt` | integer | no | Zero-based offset, default `0` |
| `maxResults` | integer | no | Number of entries, `1-100`, default `50` |

## Behavior

Reads `GET /rest/api/2/issue/{issueKey}/changelog` with `startAt` and `maxResults`.
The result includes each history author's display name, timestamp, changed field, and old/new values.
When more entries are available, the output includes the next `startAt` to request.
