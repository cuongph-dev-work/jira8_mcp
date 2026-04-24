# jira_get_components

List components for a Jira project.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | `string` | yes | Jira project key |

## Behavior

- Sends `GET /rest/api/2/project/{projectKey}/components`
- Normalizes component id, name, and description

## Output

Markdown table of components.
