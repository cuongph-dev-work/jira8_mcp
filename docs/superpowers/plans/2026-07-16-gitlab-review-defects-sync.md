# GitLab Review Defects Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `jira_sync_gitlab_review_defects` to sync top-level GitLab MR review comments into Jira Review Defect issues.

**Architecture:** Thin `src/gitlab/` HTTP client + FS config/dedup helpers + one orchestrator tool reusing Jira session, `findUsers`, `searchIssues`, and `createIssue`. Default `dryRun: true`.

**Tech Stack:** TypeScript strict ESM, Zod, Axios, Vitest, MCP SDK.

**Spec:** `docs/superpowers/specs/2026-07-16-gitlab-review-defects-sync-design.md`

## Global Constraints

- ESM imports use `.js` extensions
- Errors use `McpError` / `isError: true`
- Never auto-launch Playwright from tools
- Review Defect issue type id `10805`
- Email domain fixed: `runsystem.net`
- Dedup key: `{gitlabBaseUrl}|{projectPath}|{mrIid}|{noteId}`

---

## File Map

- Create: `src/types/gitlab-api.ts`
- Create: `src/gitlab/endpoints.ts`
- Create: `src/gitlab/http-client.ts`
- Create: `src/gitlab/mappers.ts`
- Create: `src/jira/gitlab-project-map.ts`
- Create: `src/jira/gitlab-review-dedup-store.ts`
- Create: `src/tools/sync-gitlab-review-defects.ts`
- Create: `src/tests/sync-gitlab-review-defects.test.ts`
- Create: `src/tests/gitlab-mappers.test.ts`
- Create: `docs/tools/jira_sync_gitlab_review_defects.md`
- Create: `.jira/gitlab-projects.json.example`
- Modify: `src/config.ts`, `.env.example`, `src/server.ts`, `AGENTS.md`, `CLAUDE.md`

---

### Task 1: Config + types + example map

- [x] Add optional `GITLAB_TOKEN` to Zod schema in `src/config.ts`
- [x] Document in `.env.example`
- [x] Add `.jira/gitlab-projects.json.example`
- [x] Add raw GitLab types in `src/types/gitlab-api.ts`

### Task 2: GitLab client + mappers

- [x] `endpoints.ts` — open MRs + discussions URLs
- [x] `http-client.ts` — `PRIVATE-TOKEN` axios client
- [x] `mappers.ts` — extract top-level human notes
- [x] Unit tests for mapper filtering

### Task 3: Project map + dedup store

- [x] Load/validate `.jira/gitlab-projects.json`
- [x] Local `.jira/gitlab-review-defects.json` read/has/add
- [x] Unit tests with temp dirs

### Task 4: Tool handler + server registration

- [x] `sync-gitlab-review-defects.ts` orchestration
- [x] User resolve + overrides + needsUserMapping
- [x] dryRun vs apply create Review Defect
- [x] Register in `server.ts` with `WRITE_CONFIRMATION`
- [x] Handler tests with mocks

### Task 5: Docs + verify

- [x] `docs/tools/jira_sync_gitlab_review_defects.md`
- [x] Mention in AGENTS.md / CLAUDE.md
- [x] `npx tsc --noEmit && npx vitest run`
