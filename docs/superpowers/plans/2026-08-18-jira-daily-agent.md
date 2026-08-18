# Jira Daily Briefing Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `jira_daily_briefing` MCP tool that turns the existing project daily data into a deterministic Vietnamese management briefing.

**Architecture:** Keep the existing `jira_daily` report authoritative and add a small adapter/orchestrator that collects its structured data, ranks at most `maxConcerns` concerns, optionally fetches issue evidence through the existing HTTP client, and renders the fixed headings. No writes, persistence, browser access, or cross-day state.

**Tech Stack:** TypeScript strict mode, Zod, existing `JiraHttpClient`, Vitest, MCP server registration.

---

### Task 1: Define briefing contract and failing tests

**Files:**
- Create: `src/tools/daily-briefing.ts`
- Create: `src/tests/daily-briefing.test.ts`

- [x] **Step 1: Add tests for schema defaults and fixed output headings.** Cover valid/invalid project keys, default date/maxConcerns/audience, empty data Green output, and all required Vietnamese briefing headings.
- [x] **Step 2: Add tests for severity/ranking and evidence behavior.** Cover dependency links as Red/Amber evidence, overdue/stale/missing-owner signals, concern limit, owner questions, management decisions, and partial lookup disclosure.
- [x] **Step 3: Run `npx vitest run src/tests/daily-briefing.test.ts` and verify the new evidence-limit assertion fails before the evidence lookup implementation.**

### Task 2: Implement structured briefing orchestration

**Files:**
- Modify: `src/tools/daily.ts` to expose a structured collection result without changing the existing rendered report contract.
- Create: `src/tools/daily-briefing.ts`

- [x] **Step 1: Add an exported structured daily collector that performs the existing four searches and bounded link lookups, preserving Jira totals and lookup failures.**
- [x] **Step 2: Implement `jiraDailyBriefingSchema` with `projectKey`, optional `date`, `maxConcerns` (1-20, default 5), and `audience` (default `project manager`).**
- [x] **Step 3: Rank signals in deterministic order: confirmed dependency links, overdue items, due-today items, stale items, missing owners, and missing progress; assign Red/Amber/Green per the spec and cap evidence lookups at `maxConcerns`.**
- [x] **Step 4: Render the exact section order and headings, clearly labelling Jira facts, detected signals, interpretation, recommendations, data limitations, and read-only constraints.**
- [x] **Step 5: Return `isError: true` for validation/auth/search failures and never fabricate a briefing.**

### Task 3: Register and document the tool

**Files:**
- Modify: `src/server.ts`
- Create: `docs/tools/jira_daily_briefing.md`
- Modify: `README.md`

- [x] **Step 1: Register `jira_daily_briefing` with the Zod schema and read-only description.**
- [x] **Step 2: Document inputs, fixed Vietnamese output, severity rules, empty/partial/error behavior, and examples.**
- [x] **Step 3: Add the tool to the README catalog.**

### Task 4: Verify scope and regressions

**Files:**
- No additional files.

- [x] **Step 1: Run `npx vitest run src/tests/daily-briefing.test.ts`.**
- [x] **Step 2: Run `npx tsc --noEmit`.**
- [x] **Step 3: Run `npx vitest run`.**
- [x] **Step 4: Run `node .gitnexus/run.cjs detect_changes --repo jira8_mcp` and confirm only expected briefing/report symbols and flows changed.**
