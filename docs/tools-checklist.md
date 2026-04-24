# MCP Tools — Verification Checklist

> Track which tools have been manually verified against the live Jira instance.
> Mark `[x]` when a tool has been tested and confirmed working.

Last updated: 2026-04-24

## Read Operations

| Status | Tool | Description |
|--------|------|-------------|
| [x] | `jira_get_issue` | Fetch full issue details by key |
| [x] | `jira_search_issues` | Execute JQL query, return issue list |
| [x] | `jira_get_my_worklogs` | List authenticated user's Tempo worklogs |
| [x] | `jira_get_transitions` | List available workflow transitions for an issue |
| [x] | `jira_get_create_meta` | Return static create metadata for issue types |
| [] | `jira_get_edit_meta` | Return live editable fields for an issue |
| [x] | `jira_get_projects` | List Jira projects visible to the user |
| [x] | `jira_get_components` | List components for a project |
| [x] | `jira_get_priorities` | List Jira priorities |
| [x] | `jira_find_user` | Search users by username/display name |
| [ ] | `jira_get_comments` | List comments on a Jira issue |

## Write Operations

| Status | Tool | Description |
|--------|------|-------------|
| [x] | `jira_add_worklog` | Log work on an issue via Tempo |
| [ ] | `jira_update_worklog` | Update an existing Tempo worklog |
| [ ] | `jira_delete_worklog` | Delete a Tempo worklog |
| [ ] | `jira_add_comment` | Add a comment to an issue |
| [ ] | `jira_update_comment` | Update an existing comment |
| [ ] | `jira_delete_comment` | Delete a comment |
| [ ] | `jira_create_issue` | Create a new Jira issue |
| [ ] | `jira_update_issue_fields` | Update fields on an existing issue |
| [ ] | `jira_transition_issue` | Transition an issue to a new status |
| [ ] | `jira_assign_issue` | Assign an issue to a user |
| [ ] | `jira_link_issues` | Create a link between two issues |
| [ ] | `jira_delete_issue` | Permanently delete an issue |
| [ ] | `jira_add_attachment` | Upload a file as an issue attachment |
