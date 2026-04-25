# AGENTS.md — Agent Instructions for jira-run-mcp

> This file is the canonical instruction set for any AI agent working on this project.
> Read this file in full before starting any task.

---

## What Is This Project?

`jira-run-mcp` is a TypeScript MCP (Model Context Protocol) server that provides AI agents with read access to an internal Jira 8 instance. Authentication uses Playwright-based SSO session bootstrap; API calls use HTTP with stored cookies.

## Architecture Rules

1. **Server uses factory pattern.** Each incoming MCP request gets a new `McpServer` + `StreamableHTTPServerTransport` pair. Never reuse a server instance across requests.

2. **Auth is isolated from tools.** Tools call `loadAndValidateSession()` — they never touch Playwright or browser state directly.

3. **HTTP-first for Jira access.** All Jira REST API calls go through `src/jira/http-client.ts` using Axios. Playwright is only used for the initial SSO login CLI command.

4. **Zod validates everything.** Environment variables (`src/config.ts`), tool inputs (each tool's schema), and Jira responses are all validated.

## Coding Standards

- **TypeScript strict mode.** No `any`. No implicit types.
- **ESM with `.js` extensions.** All imports must end in `.js` (NodeNext module resolution).
- **Errors use `McpError`.** Every business error must use the `McpError` class with a typed code. Use factory helpers from `src/errors.ts`.
- **Tool errors set `isError: true`.** MCP clients rely on this flag. Never return an error as normal content.
- **3xx from Jira = session expired.** Always treat redirects as auth failure. `validateStatus` accepts only 2xx.
- **Validate before saving sessions.** The `playwright-auth.ts` module validates a candidate session against Jira before writing it to disk.
- **Utility functions in `src/utils.ts`.** Shared helpers (e.g. date formatting, string manipulation) must live in `src/utils.ts`, not inline in tool or handler files.
- **Prefer libraries over hand-rolled code.** For common tasks (date formatting, duration parsing, HTTP retry, etc.), use well-known npm packages instead of writing custom implementations. Only write a manual helper if the logic is trivially small (< 5 lines) and adding a dependency would be disproportionate.
- **Raw API response types in `src/types/jira-api.ts`.** Types that mirror the exact shape of Jira/Tempo REST API responses must live in `src/types/jira-api.ts`, separate from the normalized application interfaces in `src/types.ts`. This keeps API contracts independently trackable and supports future API documentation generation.

## File Conventions

| Area | Location | Notes |
|------|----------|-------|
| MCP server entry | `src/server.ts` | Factory pattern, tool registration |
| Tool handlers | `src/tools/*.ts` | One file per tool |
| Tool documentation | `docs/tools/*.md` | One doc per tool |
| Auth layer | `src/auth/` | session-store → session-manager → playwright-auth |
| Jira HTTP layer | `src/jira/` | endpoints, mappers, http-client |
| CLI commands | `src/cli/` | auth-login, auth-check, auth-clear |
| Tests | `src/tests/` | Vitest, `vi.mock()` hoisted |
| Config | `src/config.ts` | Zod schema, env vars |
| Types | `src/types.ts` | Shared normalized interfaces |
| Raw API types | `src/types/jira-api.ts` | Raw Jira/Tempo API response shapes (mirrors exact API payloads) |
| Errors | `src/errors.ts` | McpError class, factory helpers |
| Utilities | `src/utils.ts` | Shared helpers (dates, strings, etc.) |

## Testing Requirements

- Run `npx tsc --noEmit` after every code change.
- Run `npx vitest run` before every commit.
- When adding a new tool, add corresponding tests in `src/tests/`.
- Mocks: use `vi.mock()` at file top level (Vitest hoists them). Set per-test behavior with `mockImplementation()`.

## Available MCP Tools

### `jira_get_issue`
- **Purpose:** Fetch full details for one issue by key.
- **Input:** `{ issueKey: string }` — format `PROJ-123`.
- **Output:** Markdown text with summary, description, status, assignee, reporter, priority, type, timestamps, URL.
- **Docs:** `docs/tools/jira_get_issue.md`

### `jira_search_issues`
- **Purpose:** Execute JQL query, return compact issue list.
- **Input:** `{ jql: string, limit?: number (1–50, default 10) }`
- **Output:** Markdown text with total count + issue summaries.
- **Docs:** `docs/tools/jira_search_issues.md`

## Adding a New Tool

1. Create `src/tools/<name>.ts` — export a Zod schema + async handler.
2. Handler returns `{ content: [{ type: "text", text }] }` on success, `{ content: [...], isError: true }` on failure.
3. Register in `createMcpServer()` in `src/server.ts`.
4. Write docs at `docs/tools/<name>.md`.
5. Add tests in `src/tests/`.
6. Verify: `npx tsc --noEmit && npx vitest run`.

## Common Pitfalls

| Mistake | Correct Approach |
|---------|-----------------|
| Reusing a single McpServer for concurrent requests | Create a new one per request via factory |
| Treating 3xx as success in session validation | Only 2xx is valid; 3xx = `SESSION_EXPIRED` |
| Writing session without validating | Always call `validateCandidateSession()` first |
| Returning errors as normal `content` | Always include `isError: true` |
| Using `import "./foo"` without `.js` | Must use `import "./foo.js"` (NodeNext) |
| Throwing `new Error(...)` for business logic | Use `McpError` with typed code |
| Mocking inside `vi.mock()` factory with outer variables | Vitest hoists mocks — keep factories self-contained |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **jira-run-mcp** (1630 symbols, 2895 relationships, 137 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/jira-run-mcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/jira-run-mcp/clusters` | All functional areas |
| `gitnexus://repo/jira-run-mcp/processes` | All execution flows |
| `gitnexus://repo/jira-run-mcp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
