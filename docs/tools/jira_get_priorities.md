# jira_get_priorities

List priorities configured in the Jira instance.

## Input

No parameters.

## Behavior

- Sends `GET /rest/api/2/priority`
- Normalizes priority id, name, description, and icon URL

## Output

Markdown table of priorities.
