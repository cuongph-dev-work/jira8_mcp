# jira_get_issue_links

List issue links for a Jira issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |

## Behavior

- Reads `issuelinks` via `GET /rest/api/2/issue/{issueKey}?fields=issuelinks`
- Normalizes inward/outward direction, link type, relationship text, linked issue key, summary, and status

## Output

Markdown table of linked issues.
