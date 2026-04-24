# jira_clone_issue

Clone an issue by copying core fields.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceIssueKey` | `string` | yes | Source Jira issue key |
| `summaryPrefix` | `string` | no | Prefix for cloned summary, default `Clone of` |
| `fields` | `object` | no | Field overrides for the cloned issue |

## Behavior

- Reads core source fields: project, issue type, summary, description, priority, components, labels, due date, fix versions, affects versions
- Creates a new issue with summary `{summaryPrefix} {source summary}`
- Applies `fields` overrides last
- Does not copy comments, worklogs, links, subtasks, or attachments

## Output

Markdown confirmation with source key, clone key, and browser URL.
