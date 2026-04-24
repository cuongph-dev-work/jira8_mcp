# jira_bulk_link_issues

Create multiple Jira issue links sequentially.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `links` | `array` | yes | 1-25 link requests |

Each link request contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inwardIssueKey` | `string` | yes | Source/inward issue key |
| `outwardIssueKey` | `string` | yes | Target/outward issue key |
| `linkType` | `string` | yes | Jira link type name |
| `comment` | `string` | no | Optional plain-text link comment |

## Behavior

- Calls the same Jira endpoint as `jira_link_issues` for each item
- Continues processing after per-link failures
- Marks the MCP response as `isError: true` if any link fails

## Output

Markdown table with per-link status and link id or error message.
