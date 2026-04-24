# jira_delete_issue

Permanently delete a Jira issue. **This action is IRREVERSIBLE.**

## When to Use

- The user explicitly asks to delete an issue.

## When NOT to Use

- **Closing/resolving** an issue — use `jira_transition_issue` instead.
- **Archiving** an issue — Jira 8 does not have a dedicated archive; transition to a "Closed" status instead.
- When unsure — always confirm with the user before calling this tool.

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueKey` | `string` | ✅ | — | Jira issue key (e.g. `PROJ-123`). Validated with regex. |
| `deleteSubtasks` | `boolean` | ❌ | `false` | Also delete all subtasks. If `false` and the issue has subtasks, Jira rejects with HTTP 400. |

## Output

Markdown confirmation table with:

| Field | Description |
|-------|-------------|
| **Issue** | Deleted issue key |
| **Subtasks deleted** | Whether subtasks were also deleted |

## Error Cases

| Error Code | Meaning | Action |
|------------|---------|--------|
| `INVALID_INPUT` | Invalid issue key format | Fix the `issueKey` |
| `AUTH_REQUIRED` | No session file found | Run `npm run jira-auth-login` |
| `SESSION_EXPIRED` | Session cookies expired | Run `npm run jira-auth-login` |
| `JIRA_HTTP_ERROR` (400) | Issue has subtasks but `deleteSubtasks=false` | Retry with `deleteSubtasks=true` |
| `JIRA_HTTP_ERROR` (403) | User lacks delete permission | Contact Jira admin |
| `JIRA_HTTP_ERROR` (404) | Issue does not exist | Verify the issue key |

All errors return `isError: true` in the MCP response.

## Example

```json
{
  "name": "jira_delete_issue",
  "arguments": {
    "issueKey": "PROJ-123",
    "deleteSubtasks": true
  }
}
```

### Example Output

```markdown
✅ **Issue deleted**

| Field | Value |
|---|---|
| **Issue** | PROJ-123 |
| **Subtasks deleted** | Yes |

Subtasks were also deleted.
```
