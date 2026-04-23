# CLAUDE.md — Project Instructions

Read this file every time you start working on this project.
It defines how this codebase works, coding conventions, and how to use the Jira MCP tools.

---

## Project Overview

This is `jira-run-mcp` — a TypeScript MCP server that connects AI agents to an internal Jira 8 instance protected by corporate SSO.

**Architecture:** Playwright handles SSO login (one-time), persists browser cookies locally. All Jira API calls use a plain HTTP client with those cookies. The MCP server exposes tools over Streamable HTTP transport.

**Stack:** TypeScript (strict, ESM/NodeNext), @modelcontextprotocol/sdk, Express, Zod, Playwright, Axios, Vitest.

---

## Codebase Layout

```
src/
├── server.ts              # MCP server entry — factory pattern, per-request McpServer
├── config.ts              # Zod-validated env config singleton
├── errors.ts              # McpError class + typed error codes
├── types.ts               # Shared types (SessionFile, JiraIssue, etc.)
├── auth/
│   ├── session-store.ts   # FS layer: read/write/clear .jira/session.json
│   ├── session-manager.ts # Session validation against Jira /rest/api/2/myself
│   └── playwright-auth.ts # Headed browser SSO flow + pre-save validation
├── jira/
│   ├── endpoints.ts       # URL builders for Jira REST API v2
│   ├── mappers.ts         # Raw Jira payloads → stable typed outputs
│   └── http-client.ts     # Cookie-auth axios client with auth-failure detection
├── tools/
│   ├── get-issue.ts       # jira_get_issue: fetch single issue by key
│   └── search-issues.ts   # jira_search_issues: JQL query → compact list
├── cli/
│   ├── auth-login.ts      # Interactive SSO login
│   ├── auth-check.ts      # Validate stored session
│   └── auth-clear.ts      # Remove stored session
└── tests/                 # Vitest unit + regression tests
```

---

## Coding Conventions

### TypeScript
- **Strict mode** — no `any`, no implicit types, no non-null assertions without justification.
- **ESM only** — all imports use `.js` extension (NodeNext resolution): `import { foo } from "./bar.js"`.
- **Zod for validation** — all external inputs (env vars, tool arguments, API responses) are validated with Zod schemas.
- **No classes for tools** — tool handlers are pure async functions, not class methods.

### Error Handling
- **Always use `McpError`** — never throw plain `Error` for business logic. Use factory helpers: `authRequired()`, `sessionExpired()`, `jiraHttpError()`, etc.
- **Error codes are typed** — `AUTH_REQUIRED | SESSION_EXPIRED | JIRA_HTTP_ERROR | JIRA_RESPONSE_ERROR | CONFIG_ERROR`.
- **Tool errors must set `isError: true`** — MCP clients distinguish success/failure via this flag. Every error path in a tool handler must return `{ content: [...], isError: true }`.

### Server Pattern
- **Factory per request** — `createMcpServer()` returns a new `McpServer` instance for each HTTP request. Never reuse a single server across concurrent requests.
- **Stateless transport** — `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`.

### Auth Pattern
- **Never auto-retry auth** — if session is expired, return `SESSION_EXPIRED` error and tell the user to run `npm run jira-auth-login`. Do not launch a browser during a tool call.
- **Validate before saving** — `playwright-auth.ts` validates the candidate session against Jira before writing to disk. Never overwrite a good session with an incomplete one.
- **3xx = expired** — any redirect from Jira (301, 302, 307, 308) means the session is invalid. `validateStatus` only accepts 2xx.

### Testing
- **Vitest** — all tests in `src/tests/`.
- **Mocks via `vi.mock()`** — hoisted to file top. Per-test behavior set via `mockImplementation()` / `mockResolvedValue()`.
- **Always run after changes:** `npx tsc --noEmit && npx vitest run`.

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start MCP server (tsx, hot reload) |
| `npm run build` | TypeScript compile to `dist/` |
| `npm test` | Run all tests |
| `npm run jira-auth-login` | Interactive SSO login via browser |
| `npm run jira-auth-check` | Validate stored session |
| `npm run jira-auth-clear` | Delete stored session |
| `npx tsc --noEmit` | Type-check without emit |

---

## Using Jira MCP Tools

When you have access to the `jira-run-mcp` MCP server, you can use these tools:

### `jira_get_issue`

Fetch full details for a single issue.

```
Input:  { issueKey: "PROJ-123" }
Output: key, summary, description, status, assignee, reporter, priority, issueType, created, updated, url
```

**Use when:** User mentions a specific ticket key, or you need full context before acting.

### `jira_search_issues`

Run a JQL query and return a compact issue list.

```
Input:  { jql: "project = PROJ AND status = Open", limit: 10 }
Output: total count + list of { key, summary, status, assignee, priority, updated, url }
```

**Use when:** User asks to find/list issues by criteria.

### Tool Usage Rules

1. **Single ticket → `jira_get_issue`.** Broad query → `jira_search_issues`.
2. **Default limit is 10.** Only increase if the user asks for more. Max 50.
3. **Never fabricate issue keys.** If unsure, search first.
4. **Auth errors are terminal.** Tell the user to run `npm run jira-auth-login`. Do not retry.
5. **Always show the URL** so the user can click through to Jira.
6. **Search first when ambiguous.** If the user says "check the login bug", search `text ~ "login bug"` before asking for clarification.

### JQL Quick Reference

| Intent | JQL |
|--------|-----|
| Open issues | `project = PROJ AND status != Done` |
| Bugs only | `issuetype = Bug` |
| Assigned to someone | `assignee = "alice.smith"` |
| High priority | `priority in (High, Highest)` |
| Recently updated | `updated >= -7d` |
| Text search | `text ~ "keyword"` |
| Current sprint | `sprint in openSprints()` |
| Combined + sorted | `project = PROJ AND issuetype = Bug AND status = Open ORDER BY priority DESC` |

---

## Adding New Tools

When adding a new MCP tool:

1. Create `src/tools/<tool-name>.ts` with a Zod input schema and async handler function.
2. Register the tool in `createMcpServer()` inside `src/server.ts`.
3. The handler must return `{ content: [{ type: "text", text: "..." }] }` on success.
4. All error paths must return `{ content: [...], isError: true }`.
5. Gate on `loadAndValidateSession()` if the tool needs Jira access.
6. Add a doc file at `docs/tools/<tool_name>.md`.
7. Add unit tests in `src/tests/`.
8. Run `npx tsc --noEmit && npx vitest run` before committing.

---

## Environment Variables

See `.env.example` for all variables. The only required one is:

```
JIRA_BASE_URL=https://jira.yourcompany.com
```

All others have sensible defaults defined in `src/config.ts`.

---

## Error Codes Reference

| Code | Meaning | Resolution |
|------|---------|------------|
| `AUTH_REQUIRED` | No `.jira/session.json` | `npm run jira-auth-login` |
| `SESSION_EXPIRED` | Jira rejected stored cookies | `npm run jira-auth-login` |
| `JIRA_HTTP_ERROR` | Jira API non-2xx (404, 400, 500) | Check input or Jira availability |
| `JIRA_RESPONSE_ERROR` | Unexpected API response shape | Report as a bug |
| `CONFIG_ERROR` | Missing or invalid `.env` | Fix `.env` per `.env.example` |
