# jira_link_issues

Create a Jira issue link between two issues.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inwardIssueKey` | `string` | ✅ | Source issue key |
| `outwardIssueKey` | `string` | ✅ | Target issue key |
| `linkType` | `string` | ✅ | Jira issue link type name |
| `comment` | `string \| ADF object` | ❌ | Optional link comment |

## Output

Markdown confirmation with issue keys, link type, and link id.
