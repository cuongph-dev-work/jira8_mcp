# jira_find_user

Search Jira users by username/display name.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | yes | Search text |
| `maxResults` | `number` | no | Max users to return, 1-50, default 10 |

## Behavior

- Sends `GET /rest/api/2/user/search`
- Uses Jira 8-compatible `username` search parameter
- Returns normalized identity fields useful for assignment

## Output

Markdown table with display name, username, user key, active flag, and email when Jira exposes it.
