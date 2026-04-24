# Jira Write Tools Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight Jira write/read-adjacent MCP tools plus refresh the README so the public contract matches the actual server surface.

**Architecture:** Keep handlers in `src/tools/`, HTTP transport and response validation in `src/jira/http-client.ts`, and endpoint builders in `src/jira/endpoints.ts`. Reuse shared ADF normalization and field update helpers instead of duplicating payload logic across tools.

**Tech Stack:** TypeScript, Zod, Axios, Vitest, MCP SDK, Express.

---

## File Map

- Modify: `README.md`
- Modify: `src/server.ts`
- Modify: `src/jira/endpoints.ts`
- Modify: `src/jira/http-client.ts`
- Modify: `src/types.ts`
- Create: `src/jira/adf.ts`
- Create: `src/jira/create-meta.ts`
- Create: `src/jira/update-issue.ts`
- Create: `src/tools/transition-issue.ts`
- Create: `src/tools/add-comment.ts`
- Create: `src/tools/get-create-meta.ts`
- Create: `src/tools/update-issue-fields.ts`
- Create: `src/tools/link-issues.ts`
- Create: `src/tools/assign-issue.ts`
- Create: `src/tools/get-transitions.ts`
- Create: `src/tools/get-my-worklogs.ts`
- Create: `docs/tools/jira_transition_issue.md`
- Create: `docs/tools/jira_add_comment.md`
- Create: `docs/tools/jira_get_create_meta.md`
- Create: `docs/tools/jira_update_issue_fields.md`
- Create: `docs/tools/jira_link_issues.md`
- Create: `docs/tools/jira_assign_issue.md`
- Create: `docs/tools/jira_get_transitions.md`
- Create: `docs/tools/jira_get_my_worklogs.md`
- Create: `src/tests/write-tools.test.ts`
- Create: `src/tests/http-client-write.test.ts`
- Modify: `src/tests/regression.test.ts`

### Task 1: Refresh Public Contract and Add Shared Write Helpers

**Files:**
- Modify: `README.md`
- Modify: `src/types.ts`
- Create: `src/jira/adf.ts`
- Create: `src/jira/update-issue.ts`
- Create: `src/jira/create-meta.ts`
- Test: `src/tests/write-tools.test.ts`

- [ ] Write failing tests for shared ADF normalization and static create metadata formatting.
- [ ] Run `npx vitest run src/tests/write-tools.test.ts` and confirm failure from missing helper modules.
- [ ] Implement:
  - `src/jira/adf.ts` for `string -> ADF`, pass-through ADF, and invalid shape rejection
  - `src/jira/update-issue.ts` for curated update allowlist and normalized payload assembly
  - `src/jira/create-meta.ts` for static metadata exposure from `src/jira/constants.ts`
  - `README.md` update so current tool list includes `jira_add_worklog` and planned tool descriptions have accurate summaries
- [ ] Run `npx vitest run src/tests/write-tools.test.ts` and confirm pass.

### Task 2: Transition and Comment Tools

**Files:**
- Modify: `src/jira/endpoints.ts`
- Modify: `src/jira/http-client.ts`
- Create: `src/tools/transition-issue.ts`
- Create: `src/tools/add-comment.ts`
- Create: `docs/tools/jira_transition_issue.md`
- Create: `docs/tools/jira_add_comment.md`
- Test: `src/tests/http-client-write.test.ts`
- Test: `src/tests/write-tools.test.ts`
- Modify: `src/tests/regression.test.ts`

- [ ] Write failing tests for:
  - `getTransitions()` and `transitionIssue()` in the HTTP client
  - `addComment()` in the HTTP client
  - handler auth failure returning `isError: true`
  - string/ADF comment body normalization
- [ ] Run targeted tests and confirm failure from missing methods and handlers.
- [ ] Implement transition/comment endpoint builders and HTTP client methods.
- [ ] Implement `jira_transition_issue` and `jira_add_comment`.
- [ ] Register both tools in `src/server.ts`.
- [ ] Add docs for both tools.
- [ ] Run targeted tests again and confirm pass.

### Task 3: Create Meta and Update Fields Tools

**Files:**
- Create: `src/tools/get-create-meta.ts`
- Create: `src/tools/update-issue-fields.ts`
- Create: `docs/tools/jira_get_create_meta.md`
- Create: `docs/tools/jira_update_issue_fields.md`
- Modify: `src/jira/http-client.ts`
- Test: `src/tests/write-tools.test.ts`
- Test: `src/tests/http-client-write.test.ts`
- Modify: `src/tests/regression.test.ts`

- [ ] Write failing tests for static create-meta formatting and issue update HTTP/handler flows.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement `jira_get_create_meta`.
- [ ] Implement `jira_update_issue_fields` using curated field allowlist and shared description normalization.
- [ ] Register both tools and add docs.
- [ ] Re-run targeted tests and confirm pass.

### Task 4: Link, Assign, and Get Transitions Tools

**Files:**
- Create: `src/tools/link-issues.ts`
- Create: `src/tools/assign-issue.ts`
- Create: `src/tools/get-transitions.ts`
- Create: `docs/tools/jira_link_issues.md`
- Create: `docs/tools/jira_assign_issue.md`
- Create: `docs/tools/jira_get_transitions.md`
- Modify: `src/jira/endpoints.ts`
- Modify: `src/jira/http-client.ts`
- Test: `src/tests/write-tools.test.ts`
- Test: `src/tests/http-client-write.test.ts`
- Modify: `src/tests/regression.test.ts`

- [ ] Write failing tests for link creation, assignment, and transitions read paths.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement HTTP client support and the three tool handlers.
- [ ] Register the tools and add docs.
- [ ] Re-run targeted tests and confirm pass.

### Task 5: My Worklogs Tool

**Files:**
- Create: `src/tools/get-my-worklogs.ts`
- Create: `docs/tools/jira_get_my_worklogs.md`
- Modify: `src/jira/endpoints.ts`
- Modify: `src/jira/http-client.ts`
- Modify: `src/types.ts`
- Test: `src/tests/http-client-write.test.ts`
- Test: `src/tests/write-tools.test.ts`
- Modify: `src/tests/regression.test.ts`

- [ ] Write failing tests for the Tempo worklog read path and `jira_get_my_worklogs`.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement the Tempo read endpoint and handler, reusing `getCurrentUser()`.
- [ ] Register the tool and add docs.
- [ ] Re-run targeted tests and confirm pass.

### Task 6: Full Verification

**Files:**
- Modify: `README.md`
- Modify: `src/server.ts`
- Modify: docs and test files touched above

- [ ] Run `npx tsc --noEmit`
- [ ] Run `npx vitest run`
- [ ] Check `git status --short` to confirm only intended files changed
- [ ] Review tool names in `src/server.ts` and docs for consistency

## Self-Review

- Spec coverage:
  The plan covers README refresh, all eight requested tools, shared helpers, docs, tests, and final verification.
- Placeholder scan:
  No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency:
  Tool names, file paths, and helper module names are consistent with the approved spec.
