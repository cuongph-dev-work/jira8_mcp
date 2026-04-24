# jira_transition_issue

Transition a Jira issue to a target workflow state.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key |
| `transitionId` | `string` | conditional | Target transition id |
| `transitionName` | `string` | conditional | Target transition name, resolved against current available transitions |
| `comment` | `string \| ADF object` | ❌ | Optional transition comment |
| `fields` | `object` | ❌ | Optional field updates to send with the transition |

Provide exactly one of `transitionId` or `transitionName`.

## Behavior

- Sends `POST /rest/api/2/issue/{issueKey}/transitions`
- If `transitionName` is provided, first reads available transitions and requires exactly one case-insensitive match
- If `comment` is provided, plain text is normalized to ADF
- If `fields` are provided, only the curated update-field allowlist is accepted

## Output

Markdown confirmation with issue key, transition id, and browser URL.
