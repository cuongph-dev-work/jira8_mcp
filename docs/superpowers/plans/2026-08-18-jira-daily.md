# jira_daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `jira_daily` MCP tool that produces a project/date-scoped Jira delivery report with progress and blocker analysis.

**Architecture:** Extend the existing search fields, raw/normalized summary mapping, and issue-link client support without changing existing call signatures. Add a focused orchestration tool with testable JQL builders and formatting helpers, register it in the server, and document it in the tool catalog.

**Tech Stack:** TypeScript strict mode, Zod, Axios-backed `JiraHttpClient`, Vitest, MCP tool handlers.

---

### Task 1: Extend search contracts

**Files:** `src/types.ts`, `src/jira/endpoints.ts`, `src/jira/mappers.ts`, `src/types/jira-api.ts`

- [x] Add nullable status category, labels, description, WBSGantt progress, percent-done, and original-estimate-seconds fields to normalized/raw search contracts.
- [x] Request the required Jira fields and map missing values consistently.
- [x] Run focused mapper/type tests and `npx tsc --noEmit`.

### Task 2: Add daily report tests

**Files:** Create `src/tests/daily.test.ts`

- [x] Add failing tests for schema/defaults, exact JQL, parallel search/total merging, progress weighting, status exclusions, blocker signals, bounds, Markdown sections, errors, empty projects, and partial link failures.
- [x] Run `npx vitest run src/tests/daily.test.ts` and confirm the new tests fail for missing implementation.

### Task 3: Implement `jira_daily`

**Files:** Create `src/tools/daily.ts`

- [x] Implement Zod input validation and four exported JQL builders.
- [x] Authenticate once, run four searches in parallel, deduplicate bounded details while retaining totals, and calculate status/progress summaries.
- [x] Select blocker candidates, fetch links through bounded concurrency, preserve partial link failures, classify signals/severity, and render all required Markdown sections plus `navigationHint()`.
- [x] Return all validation/auth/Jira/unexpected failures with `isError: true`.
- [x] Run the daily tests and `npx tsc --noEmit`.

### Task 4: Register and document

**Files:** `src/server.ts`, `docs/tools/jira_daily.md`, `README.md`

- [x] Register the read-only tool in `createMcpServer()` with its schema and description.
- [x] Add tool documentation, examples, and README catalog/reference entries.
- [x] Run the full Vitest suite and TypeScript compiler.

### Task 5: Scope verification

- [x] Run GitNexus `detect_changes()`; it reports medium risk because the worktree also contains pre-existing unrelated changes.
- [x] Review `git diff` for unrelated modifications and preserve them untouched.
