# jira_get_projects

List Jira projects visible to the authenticated user.

## Input

No parameters.

## Behavior

- Sends `GET /rest/api/2/project`
- Normalizes project id, key, name, and browser URL

## Output

Markdown table of projects.
