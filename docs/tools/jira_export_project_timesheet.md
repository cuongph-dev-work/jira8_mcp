# jira_export_project_timesheet

Export a Jira project's full Tempo timesheet (all members) for a date range to a native Tempo export file.

## Purpose

This tool drives Tempo's own two-step Server/DC export flow (the same one used by the Tempo Timesheets UI's "Export" button) to produce an `.xlsx`/`.xls`/`.csv` file covering **every member's** worklogs on a project, rather than a hand-picked list of workers. Unlike `jira_search_worklogs` (which requires an explicit `workers` list), this tool filters by `projectKey` so it automatically covers all contributors.

The exported file is Tempo's own native output — no custom spreadsheet is built. The file is saved to the local downloads folder and the absolute path is returned.

## Input Schema

- `projectKey` (string): Jira project key, e.g. `"PROJ"`.
- `dateFrom` (string): Start of date range in `yyyy-MM-dd` format (e.g., `"2026-04-01"`).
- `dateTo` (string): End of date range inclusive in `yyyy-MM-dd` format (e.g., `"2026-04-30"`).
- `format` (optional, `"xlsx" | "xls" | "csv"`, default `"xlsx"`): Requested export format. User-facing `xlsx` is sent to Tempo as `ooxml` (Office Open XML). The actual file extension written to disk is confirmed from the server's response headers.

## Output

Returns Markdown with:
- Project key, date range, resolved format/extension
- Absolute file path on disk
- Human-readable file size

## Examples

### Export a Full Month for One Project

**Input:**
```json
{
  "projectKey": "ME",
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-30"
}
```

### Export as CSV

**Input:**
```json
{
  "projectKey": "ME",
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-30",
  "format": "csv"
}
```

## Known Limitations

- Tempo Server/DC expects `format=ooxml` for Excel `.xlsx` (not `xlsx`). The tool maps this automatically.
- `format=xls` may return HTTP 500 on some Tempo versions; prefer `xlsx` or `csv`.
- This tool does not attach the file to a Jira issue. Chain it with `jira_upload_attachment_content` (base64-encode the file content) if you need it on an issue.

## See Also

- `jira_search_worklogs` — fetch worklogs for specific named workers instead of a whole project
- `jira_get_timesheet_approvals` — check timesheet approval status for a Tempo team
- `jira_upload_attachment_content` — attach the exported file to a Jira issue afterward
