# jira_update_worklog

Update a Tempo worklog by id.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `worklogId` | `string` | yes | Tempo worklog id |
| `timeSpent` | `string` | no | Duration using `Nd`, `Nh`, `Nm` tokens |
| `startDate` | `string` | no | Work date in `yyyy-MM-dd` format |
| `comment` | `string` | no | Updated worklog comment |
| `process` | `string` | no | Tempo Process attribute |
| `typeOfWork` | `string` | no | Tempo Type Of Work attribute |

## Behavior

- Sends `PUT /rest/tempo-timesheets/4/worklogs/{worklogId}`
- Requires at least one update field
- Duration is converted to seconds using the same parser as `jira_add_worklog`

## Output

Markdown confirmation with Tempo id, issue key, date, and duration.
