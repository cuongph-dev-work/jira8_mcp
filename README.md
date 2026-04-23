# jira-run-mcp

An internal MCP (Model Context Protocol) server for Jira 8, using SSO session bootstrap via Playwright and HTTP-first tool execution.

## Stack

- **TypeScript** — strict, ESM (NodeNext)
- **@modelcontextprotocol/sdk** — MCP server + Streamable HTTP transport
- **Express** — HTTP layer for the MCP endpoint
- **Playwright** — interactive SSO login and session persistence
- **Zod** — config and tool input validation
- **Axios** — Jira REST API HTTP client

## Features

- 🔐 SSO authentication via Playwright (headed browser)
- 💾 Persistent local session (Playwright storage state / cookies)
- 🔍 `jira_get_issue` — fetch a single issue by key
- 🔎 `jira_search_issues` — execute JQL and return a compact issue list
- 📝 `jira_create_issue` — create an issue using issue-type-specific required and optional fields
- 🛡️ Clean `SESSION_EXPIRED` / `AUTH_REQUIRED` errors with reauthentication hints
- 🖥️ Three CLI utilities for session management

## Requirements

- Node.js >= 20
- Access to an internal Jira 8 instance (SSO)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright browsers

```bash
npx playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your Jira base URL:

```env
JIRA_BASE_URL=https://jira.yourcompany.com
```

See `.env.example` for all available options.

### 4. Authenticate

```bash
npm run jira-auth-login
```

A browser window will open. Complete the SSO login manually. The session is saved to `.jira/session.json` automatically.

### 5. Verify session

```bash
npm run jira-auth-check
```

### 6. Start the MCP server

```bash
npm run dev
```

The server will be available at:

- **MCP endpoint:** `http://localhost:3000/mcp`
- **Health check:** `http://localhost:3000/health`

## CLI Utilities

| Command | Description |
|---|---|
| `npm run jira-auth-login` | Launch SSO browser flow and save session |
| `npm run jira-auth-check` | Validate whether the stored session is alive |
| `npm run jira-auth-clear` | Remove the stored session file |

## MCP Tools

### `jira_get_issue`

Fetch a single Jira issue by key.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key, e.g. `PROJ-123` |

**Output:** Key, summary, description, status, assignee, reporter, priority, issue type, created/updated timestamps, URL.

---

### `jira_search_issues`

Execute a JQL query and return a compact issue list.

**Input:**
| Field | Type | Description |
|---|---|---|
| `jql` | `string` | JQL query, e.g. `project = PROJ AND status = Open` |
| `limit` | `number` | Max results (1–50, default 10) |

**Output:** Total count + list of issues (key, summary, status, assignee, priority, updated, URL).

---

### `jira_create_issue`

Create a Jira issue for a specific issue type.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueTypeId` | `string` | Jira issue type ID from `src/jira/constants.ts` |
| `fields` | `object` | Jira create fields keyed by standard field names or `customfield_*` IDs |

**Output:** Confirmation with created issue key, summary, issue type, and browser URL.

## Project Structure

```
src/
├── server.ts              # MCP server entry point
├── config.ts              # Env var validation (Zod)
├── errors.ts              # Typed error classes & factories
├── types.ts               # Shared TypeScript types
├── auth/
│   ├── session-store.ts   # Read/write/clear session.json
│   ├── session-manager.ts # Session validation against Jira
│   └── playwright-auth.ts # Headed SSO browser flow
├── jira/
│   ├── endpoints.ts       # URL builders (REST API v2)
│   ├── mappers.ts         # Raw payload → typed output shapes
│   ├── create-issue.ts    # Create-issue validation and payload helpers
│   └── http-client.ts     # Cookie-authenticated Jira HTTP client
├── tools/
│   ├── get-issue.ts       # jira_get_issue handler
│   ├── search-issues.ts   # jira_search_issues handler
│   └── create-issue.ts    # jira_create_issue handler
├── cli/
│   ├── auth-login.ts      # jira-auth-login entry point
│   ├── auth-check.ts      # jira-auth-check entry point
│   └── auth-clear.ts      # jira-auth-clear entry point
└── tests/                 # Unit tests (Vitest)
```

## Authentication Flow

```
Operator
  │
  ▼
npm run jira-auth-login
  │
  ├── Playwright opens browser (headed)
  ├── Operator completes SSO manually
  ├── storageState saved → .jira/session.json
  └── Session validated immediately
  
MCP Tool Call
  │
  ├── Load .jira/session.json
  ├── Validate against /rest/api/2/myself
  ├── Extract cookies → build HTTP request
  └── Return normalized Jira data
  
Session Expired?
  │
  └── Returns [SESSION_EXPIRED] error
      → "Run: npm run jira-auth-login"
```

## Development

```bash
# Type check
npx tsc --noEmit

# Run tests
npm test

# Watch mode
npm run test:watch

# Build for production
npm run build
```

## Error Codes

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | No session file found — run `jira-auth-login` |
| `SESSION_EXPIRED` | Session exists but Jira rejected it — rerun `jira-auth-login` |
| `JIRA_HTTP_ERROR` | Unexpected HTTP error from Jira REST API |
| `JIRA_RESPONSE_ERROR` | Jira returned an unexpected response shape |
| `CONFIG_ERROR` | Invalid or missing environment variable |
| `INVALID_INPUT` | Tool input or issue-type-specific field set is invalid |

## Security Notes

- `.env` and `.jira/session.json` are **git-ignored** and must never be committed.
- Session cookies give full Jira access as the authenticated user — treat them like passwords.
- The session file is stored locally only; no remote storage is involved.
