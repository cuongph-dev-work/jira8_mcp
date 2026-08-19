# jira_daily_briefing

Produce a fixed-format Vietnamese delivery briefing for one Jira project. The tool is stateless and read-only: it uses the existing `jira_daily` data collection, then fetches details only for the highest-impact concerns.

## Input

| Field | Type | Default | Description |
|---|---|---:|---|
| `projectKey` | `string` | required | Jira project key, for example `PROJ` |
| `date` | `string` | local today | Report date in `yyyy-MM-dd` format |
| `maxConcerns` | `number` | `5` | Maximum concerns and issue-evidence lookups (1-20) |
| `audience` | `string` | `project manager` | Audience label (kept for compatibility; not shown in the briefing) |

## Output

Headings are always emitted in this order: title (`Daily brief dự án …`), `Tổng quan`, `Các điểm cần quản lý chú ý`, and `Việc cần chốt hôm nay`. Issue keys are markdown links `[KEY](url)`. Confirmed Jira dependency links are distinguished from heuristic text signals.

Overall status uses emoji instead of color words:

- `🔴 / cần xử lý ngay` — high-impact confirmed dependency or overdue dependency
- `🟠 / cần theo dõi` — material overdue, stale, heuristic, or missing-data signals
- `🟢 / ổn` — no material signal, including empty projects (weighted progress `N/A`)

Authentication or search failures return `isError: true`; the tool never fabricates a briefing. Partial dependency lookups are disclosed in a one-line note after the actions. No comments, transitions, worklogs, approvals, or other Jira writes are performed.

## Example

```json
{
  "projectKey": "PROJ",
  "date": "2026-08-18",
  "maxConcerns": 5,
  "audience": "project manager"
}
```
