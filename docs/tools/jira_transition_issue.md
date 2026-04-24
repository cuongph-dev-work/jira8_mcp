# jira_transition_issue

Transition a Jira issue to a target workflow state.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |
| `transitionId` | `string` | ✅ | Target transition id |
| `comment` | `string \| ADF object` | ❌ | Optional transition comment |
| `fields` | `object` | ❌ | Optional field updates to send with the transition |

## Behavior

- Sends `POST /rest/api/2/issue/{issueKey}/transitions`
- If `comment` is provided, plain text is normalized to ADF
- If `fields` are provided, only the curated update-field allowlist is accepted

## Output

Markdown confirmation with issue key, transition id, and browser URL.
