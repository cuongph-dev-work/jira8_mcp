# jira_create_subtask

Create a subtask under a parent issue.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parentIssueKey` | `string` | yes | Parent Jira issue key |
| `issueTypeId` | `string` | yes | Jira subtask issue type id for the project |
| `fields` | `object` | yes | Jira create fields; `parent` and `issuetype` are injected |

## Behavior

- Builds a normal Jira create payload
- Injects `parent: { key: parentIssueKey }`
- Injects `issuetype: { id: issueTypeId }`
- Sends `POST /rest/api/2/issue`

## Output

Markdown confirmation with parent key, subtask key, and browser URL.
