# Jira Daily Briefing Agent - Design Spec

**Date:** 2026-08-18  
**Status:** Draft - prompt/workflow design only

## Goal

Define a stateless management briefing agent that accepts a Jira `projectKey`
on every run, reads the existing `jira_daily` report, selectively fetches
issue details when risk signals need evidence, and returns a fixed-format
Vietnamese delivery briefing. The agent is read-only and does not change Jira.

## Input Contract

- `projectKey` is required and must be a valid Jira project key.
- `date` is optional and defaults to the current local date.
- `maxConcerns` is optional and defaults to 5.
- `audience` is optional and defaults to project manager.

Natural-language requests may provide these values, for example:
`Tạo daily briefing cho PROJ ngày 2026-08-18.`

If `projectKey` is missing or invalid, ask for/correct it before calling Jira.

## Agent Workflow

1. Parse `projectKey`, `date`, `maxConcerns`, and `audience`.
2. Call `jira_daily` for the requested project and date.
3. Read the executive summary, status/progress, due-today, overdue,
   blocker/risk, and analysis sections.
4. Rank delivery signals: real dependency links, overdue work, due-today
   work, stale issues, missing owners, and missing progress.
5. Fetch details with `jira_get_issue`, `jira_get_issue_links`, or
   `jira_get_issue_history` only for the highest-impact issues, up to five by
   default.
6. Produce the fixed Vietnamese briefing format below.
7. End with numbered “Việc cần chốt hôm nay” items only when matching signals exist.

The agent must distinguish Jira facts, detected signals, interpretation, and
recommended management attention. It must not infer causes, ETAs, or promises
that Jira does not support.

## Severity

- **🔴 / cần xử lý ngay:** serious dependency/blocker with overdue impact, substantial overdue
  delivery risk, or clear evidence that a deadline is threatened.
- **🟠 / cần theo dõi:** overdue/stale work, heuristic blocker evidence, or significant
  missing ownership/progress data without confirmed critical dependency.
- **🟢 / ổn:** no material delivery risk signals in the available Jira data.

## Fixed Output Format

```text
**Daily brief dự án <projectKey> — <DD/MM/YYYY>**

**Tổng quan: 🟢 / ổn | 🟠 / cần theo dõi | 🔴 / cần xử lý ngay**

- N issue đang active
- N issue đang In Progress
- N issue đã hoàn thành
- N issue đến hạn hôm nay
- N issue quá hạn
- Weighted progress: **N,N%** | N/A

**Các điểm cần quản lý chú ý**

- [ISSUE-KEY](url) — <summary>: trạng thái <status>, <signal>; owner <name>|chưa có owner.

**Việc cần chốt hôm nay**

1. <action only when the matching signal exists>

Báo cáo chỉ đọc, không có thay đổi nào được ghi vào Jira.
```

The section order and headings are fixed. Issue keys are markdown links.
The agent may omit empty action items, but it must preserve all headings.
It must not reproduce the complete Jira issue list when no issue is a concern.

## Error and Empty-Data Behavior

- No issues: report the project as `🟢 / ổn` and state that no risk signal was
  found in the current Jira data.
- Weighted progress with no valid sample: show `N/A`, never `0%`. If the
  computed value is `0,0%`, add a note to re-check estimates.
- Authentication/search failure: explain that no reliable briefing can be
  produced and do not fabricate a report.
- Partial issue-link failure: preserve the base report and disclose the
  number of failed dependency lookups in a one-line note after the actions.
- Write requests: explain that this agent is read-only and may only recommend
  Jira actions.

## Scope and Guardrails

- One project per run; no persistent state or automatic cross-day comparison.
- `jira_daily` is the authoritative overview for the run.
- Additional tool calls are evidence gathering, not a second independent
  report generation path.
- No comments, transitions, worklogs, approvals, or other Jira writes.
- Fixed Vietnamese output is intended for a busy project manager.

## Success Criteria

- A manager can understand project health and the top delivery concerns in
  under one minute.
- Every concern has an issue key or numeric Jira evidence.
- Real Jira links and heuristic text signals are labelled separately.
- Missing data and partial failures are visible.
- Repeated runs for the same project use the same headings and severity rules.
