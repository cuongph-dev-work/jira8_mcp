# Tempo Timesheet Review & Approval Workflow

This document describes the end-to-end flow for reviewing and approving team timesheets using the Jira MCP server's Tempo tools. It is intended for **Team Leads and PMs** who manage timesheet approvals weekly.

---

## 🗺️ Tool Map

| Tool | API Endpoint | Purpose |
|------|-------------|---------|
| `jira_search_tempo_teams` | `POST /rest/tempo-teams/3/search` | Find team by name → get `teamId` |
| `jira_get_timesheet_approvals` | `GET /rest/tempo-timesheets/4/timesheet-approval` | Current approval status of all team members |
| `jira_get_timesheet_approval_log` | `GET /rest/tempo-timesheets/4/timesheet-approval/log` | Audit trail: who submitted/approved/rejected and when |
| `jira_search_worklogs` | `POST /rest/tempo-timesheets/4/worklogs/search` | Actual worklog entries for specific people |
| `jira_export_project_timesheet` | `POST /worklogs/export/filter` + `GET /worklogs/export/{id}` | Export a whole project's timesheet (all members) to xlsx/xls/csv |
| `jira_act_on_timesheet_approval` | `POST /rest/tempo-timesheets/4/timesheet-approval` | Approve, reject, or reopen a member's timesheet |

---

## 🔄 Full Workflow

```
Step 1: Find Team
  jira_search_tempo_teams({ query: "GensaiPlatform" })
  → Returns teamId (e.g., 531)

Step 2: Check Submission Status
  jira_get_timesheet_approvals({ teamId: 531, periodStartDate: "2026-04-20" })
  → Who submitted? Who hasn't? Who is already approved?

Step 3a: Review Audit Trail (optional)
  jira_get_timesheet_approval_log({ teamId: 531, periodStartDate: "2026-04-20" })
  → Timeline of every submit/approve/reject action with reviewer and timestamp

Step 3b: Drill Into Worklogs (optional)
  jira_search_worklogs({ dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["user@runsystem.net"] })
  → Every worklog entry: issue, hours, process, type of work, comment

Step 4: Take Action
  jira_act_on_timesheet_approval({ userKey: "user@runsystem.net", periodDateFrom: "2026-04-20", action: "approve", comment: "ok" })
  → ✅ Approved / ❌ Rejected / 🔄 Reopened
```

---

## 💬 Use Case Prompts

Use these prompts directly with the AI agent to trigger the appropriate tools.

---

### Use Case 1 — Weekly Review Kickoff

> **"Kiểm tra trạng thái timesheet tuần này của team GensaiPlatform. Tuần bắt đầu 2026-04-20."**

Expected flow:
1. `jira_search_tempo_teams({ query: "GensaiPlatform" })` → get teamId
2. `jira_get_timesheet_approvals({ teamId: <id>, periodStartDate: "2026-04-20" })` → status table

---

### Use Case 2 — Who Hasn't Submitted?

> **"Ai trong team chưa submit timesheet tuần 2026-04-20?"**

Expected flow:
1. `jira_search_tempo_teams({ query: "..." })`
2. `jira_get_timesheet_approvals(...)` → filter status = `open`

---

### Use Case 3 — Full Audit Before Approving

> **"Xem lịch sử submit/approve của team 531 tuần 2026-04-20 trước khi tôi approve."**

Expected flow:
1. `jira_get_timesheet_approval_log({ teamId: 531, periodStartDate: "2026-04-20" })` → audit trail

---

### Use Case 4 — Verify Someone's Work Before Approving

> **"Xem ducnpp@runsystem.net đã log gì tuần này trước khi tôi approve?"**

Expected flow:
1. `jira_search_worklogs({ dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["ducnpp@runsystem.net"] })`
2. Review, then `jira_act_on_timesheet_approval(..., action: "approve")`

---

### Use Case 5 — Bulk Approve All Submitted Members

> **"Approve toàn bộ người đã submit timesheet tuần 2026-04-20 trong team 531."**

Expected flow:
1. `jira_get_timesheet_approvals({ teamId: 531, periodStartDate: "2026-04-20" })`
2. Agent identifies all users with `status = waiting_for_approval`
3. For each user: `jira_act_on_timesheet_approval({ userKey, periodDateFrom: "2026-04-20", action: "approve", comment: "ok" })`

> [!IMPORTANT]
> This is a write action. The agent will preview the list of users to be approved and ask for your confirmation before proceeding.

---

### Use Case 6 — Reject With Reason

> **"Reject timesheet của lapdq@runsystem.net tuần 2026-04-20. Lý do: thiếu 8h ngày thứ Ba, cần bổ sung lại."**

Expected flow:
1. `jira_act_on_timesheet_approval({ userKey: "lapdq@runsystem.net", periodDateFrom: "2026-04-20", action: "reject", comment: "Thiếu 8h ngày thứ Ba, cần bổ sung lại." })`

> [!IMPORTANT]
> This is a write action. The agent will preview the list of users to be approved and ask for your confirmation before proceeding.


---

### Use Case 7 — Reopen After Accidental Approval

> **"Reopen timesheet của phunt@runsystem.net tuần 2026-04-20, tôi approve nhầm."**

Expected flow:
1. `jira_act_on_timesheet_approval({ userKey: "phunt@runsystem.net", periodDateFrom: "2026-04-20", action: "reopen", comment: "Approved nhầm, cần review lại." })`

---

### Use Case 8 — Cross-Team Worklog Report

> **"Tổng hợp số giờ làm của 3 người: ducnpp, quocpa, lapdq trong tuần 2026-04-20 đến 2026-04-26."**

Expected flow:
1. `jira_search_worklogs({ dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["ducnpp@runsystem.net", "quocpa@runsystem.net", "lapdq@runsystem.net"] })`

---

### Use Case 9 — Export Full Project Timesheet

> **"Xuất timesheet cả tháng 4 của dự án ME ra file Excel."**

Expected flow:
1. `jira_export_project_timesheet({ projectKey: "ME", dateFrom: "2026-04-01", dateTo: "2026-04-30" })` → saves an `.xlsx` file locally covering every project member and returns the file path.

---

## 🏗️ Status Reference

| Status | Meaning |
|--------|---------|
| `open` 🟢 | Member has not submitted yet |
| `waiting_for_approval` 🔘 | Submitted, awaiting review |
| `approved` ✅ | Approved by reviewer |
| `rejected` ❌ | Rejected — member must fix and resubmit |

---

## 🔑 Key Notes for the Agent

1. **TeamId resolution:** When the user mentions a team by name (e.g., "team GensaiPlatform"), always call `jira_search_tempo_teams` first to get the numeric `teamId`.

2. **Reviewer is auto-resolved:** `jira_act_on_timesheet_approval` automatically uses the current authenticated user as reviewer — do not ask the user for their key.

3. **Write confirmation required:** Before calling `jira_act_on_timesheet_approval`, show the user a preview of who will be affected and get explicit confirmation.

4. **Period dates:** Tempo periods are weekly. `periodStartDate` / `periodDateFrom` is always the **Monday** of the week (e.g., `2026-04-20` for the week of April 20–26, 2026).

5. **Log vs Status:** `jira_get_timesheet_approval_log` shows **history** (all past actions). `jira_get_timesheet_approvals` shows **current state**. Use both for a complete picture.
