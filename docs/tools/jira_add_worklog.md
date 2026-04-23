# jira_add_worklog

Log work (create a worklog) on a Jira issue via Tempo Timesheets.

## Overview

Creates a worklog entry using the Tempo Timesheets REST API (`POST /rest/tempo-timesheets/4/worklogs`). The worker is automatically set to the current authenticated user — no admin logging for others.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | `string` | ✅ | Jira issue key (e.g. `PROJ-123`) |
| `timeSpent` | `string` | ✅ | Duration string (see format below) |
| `startDate` | `string` | ✅ | Date of work in `yyyy-MM-dd` format |
| `comment` | `string` | ❌ | Description of work performed |
| `includeNonWorkingDays` | `boolean` | ❌ | Include weekends/holidays (default `false`) |

### Duration Format

Use combinations of:

| Token | Meaning | Example |
|-------|---------|---------|
| `Nd` | Days (1 day = 8 hours) | `1d` = 28800s |
| `Nh` | Hours | `2h` = 7200s |
| `Nm` | Minutes | `30m` = 1800s |

Combinations: `"1d 4h 30m"` → 37800 seconds

## Output

Markdown text with a confirmation table containing:

- Issue key and summary
- Worker display name
- Date, duration, and comment
- Tempo worklog ID
- Jira worklog ID (if available)

## Example

### Input

```json
{
  "issueKey": "PROJ-123",
  "timeSpent": "2h 30m",
  "startDate": "2026-04-24",
  "comment": "Fixed login validation bug"
}
```

### Output

```
✅ **Worklog created successfully**

| Field | Value |
|-------|-------|
| **Issue** | PROJ-123: Fix login validation |
| **Project** | PROJ |
| **Worker** | Cuong Pham |
| **Date** | 2026-04-24 |
| **Duration** | 2h 30m (9000s) |
| **Comment** | Fixed login validation bug |
| **Tempo ID** | 12345 |
```

## Errors

| Error | Cause |
|-------|-------|
| `INVALID_INPUT` | Invalid issue key, duration format, or date format |
| `AUTH_REQUIRED` | No session file found |
| `SESSION_EXPIRED` | Session cookies expired — re-authenticate |
| `JIRA_HTTP_ERROR` | Tempo API returned non-2xx status |

## API Details

- **Endpoint:** `POST {JIRA_BASE_URL}/rest/tempo-timesheets/4/worklogs`
- **Auth:** Same Jira session cookies (SSO)
- **User detection:** `GET /rest/api/2/myself` → `key` field
