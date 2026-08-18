# jira_daily_briefing

Produce a fixed-format Vietnamese delivery briefing for one Jira project. The tool is stateless and read-only: it uses the existing `jira_daily` data collection, then fetches details only for the highest-impact concerns.

## Input

| Field | Type | Default | Description |
|---|---|---:|---|
| `projectKey` | `string` | required | Jira project key, for example `PROJ` |
| `date` | `string` | local today | Report date in `yyyy-MM-dd` format |
| `maxConcerns` | `number` | `5` | Maximum concerns and issue-evidence lookups (1-20) |
| `audience` | `string` | `project manager` | Audience label used in the executive summary |

## Output

The headings are always emitted in this order: `Executive summary`, `Top concerns`, `On track`, `Questions for owners`, `Management decisions needed`, and `Data limitations`. Each concern includes severity, Jira evidence, owner, and a concrete management-attention item. Confirmed Jira dependency links are distinguished from heuristic text signals.

Severity is `Red` for a high-impact confirmed dependency or overdue dependency, `Amber` for material overdue/stale/heuristic/missing-data signals, and `Green` when no material signal is present. Empty projects return Green with weighted progress `N/A`.

Authentication or search failures return `isError: true`; the tool never fabricates a briefing. Partial dependency lookups are disclosed in `Data limitations`. No comments, transitions, worklogs, approvals, or other Jira writes are performed.

## Example

```json
{
  "projectKey": "PROJ",
  "date": "2026-08-18",
  "maxConcerns": 5,
  "audience": "project manager"
}
```
