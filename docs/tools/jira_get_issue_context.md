# `jira_get_issue_context`

## Purpose

Return a compact, token-efficient context snapshot of a single Jira issue.

Use this tool when you need a quick summary of an issue for reasoning or chaining, without the full verbosity of `jira_get_issue`. By default it returns key identity, status, people, dates, time tracking, metadata counts, and an optional description excerpt. When `includeComments=true`, it also fetches a compact recent-comments section for intake and analysis use cases.

## When to Use

| Scenario | Tool to use |
|----------|------------|
| Quick status check before a transition | `jira_get_issue_context` |
| Reasoning step in a multi-tool workflow | `jira_get_issue_context` |
| Intake step for issue analysis with recent clarifications | `jira_get_issue_context` with `includeComments=true` |
| Full details, attachments, bug fields | `jira_get_issue` |
| Audit with comments, links, subtasks | `jira_get_audit_context` |

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueKey` | `string` | ✅ | — | Jira issue key, e.g. `PROJ-123` |
| `maxDescriptionLength` | `number` (0–2000) | ❌ | `500` | Max chars of description to include. Set `0` to omit entirely. |
| `includeComments` | `boolean` | ❌ | `false` | Fetch and include recent comments. Set `true` for intake/analysis flows. |
| `maxComments` | `number` (1–20) | ❌ | `5` | Max recent comments to include when `includeComments=true`. |
| `includeHints` | `boolean` | ❌ | `false` | Append navigation hints. Enable only for final user-facing output. |

## Output

A single markdown text block with this structure:

```
**PROJ-42** · Bug · In Progress · High
URL: https://jira.example.com/browse/PROJ-42

Assignee: John Doe  |  Reporter: Jane Smith
Created: 12 Apr 2026  |  Updated: 27 Apr 2026  |  Due: 30 Apr 2026

Estimated: 4h  |  Logged: 2h  |  Remaining: 2h
Parent: PROJ-10  |  Labels: backend, release-1.2  |  Sub-tasks: 3  |  Attachments: 2

Description (first 500 chars):
When calling the /login endpoint with an expired token…

Recent Comments (2):
[101] Alice · 20 Apr 2026: Clarified rollback is not required for this release
[102] Bob · 21 Apr 2026: FE should hide the button only after backend flag is present
```

### Included fields

- **Header**: key · issue type · status · priority
- **URL**: direct browse link
- **People**: assignee, reporter
- **Dates**: created, updated, due (if set)
- **Time tracking**: estimated, logged, remaining (only non-null values shown)
- **Relations/metadata**: parent, epic link, labels, components, sub-task count, attachment count, resolution
- **Description excerpt**: first `maxDescriptionLength` characters (with `…` if truncated); omitted when `maxDescriptionLength=0`
- **Recent comments**: compact one-line comments when `includeComments=true`
- **Navigation hints**: appended only when `includeHints=true`

### Not included (use `jira_get_issue` for these)

- Full sub-task table (key, type, status, priority per sub-task)
- Attachment metadata and content
- Bug/defect custom fields (defect type, cause analysis, impact assessment, etc.)
- Full description

## Examples

### Minimal call

```json
{ "issueKey": "PROJ-42" }
```

### Intake / analysis call

```json
{
  "issueKey": "PROJ-42",
  "includeComments": true,
  "maxComments": 5
}
```

### Omit description (pure metadata)

```json
{ "issueKey": "PROJ-42", "maxDescriptionLength": 0 }
```

### Longer description excerpt

```json
{ "issueKey": "PROJ-42", "maxDescriptionLength": 1000 }
```

### Final user-facing output with hints

```json
{
  "issueKey": "PROJ-42",
  "includeComments": true,
  "includeHints": true
}
```

## Navigation Hints

Navigation hints are omitted by default. When `includeHints=true`, the tool appends:

```
💡 Next:
- `jira_get_issue({issueKey: "PROJ-42"})` for full detail
- `jira_get_comments({issueKey: "PROJ-42"})` for comments
- `jira_get_transitions({issueKey: "PROJ-42"})` to change status
```
