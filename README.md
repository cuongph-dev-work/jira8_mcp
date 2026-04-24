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
- ⏱️ `jira_add_worklog` — log work on a Jira issue through Tempo Timesheets
- 📝 `jira_create_issue` — create an issue using issue-type-specific required and optional fields
- 💬 `jira_add_comment` — add plain-text or ADF comments to an issue
- ✏️ `jira_update_comment` / `jira_delete_comment` — update or remove issue comments
- 🔄 `jira_transition_issue` — move an issue through workflow transitions by id or name
- 🧭 `jira_get_create_meta` — inspect static create metadata from `src/jira/constants.ts`
- 🧭 `jira_get_edit_meta` — inspect live editable fields for one issue
- ✏️ `jira_update_issue_fields` — update a curated set of Jira fields safely
- 🛡️ `jira_validate_issue_update` — validate update payloads without writing
- 🛡️ `jira_bulk_update_issue_fields` / `jira_bulk_transition_issues` — bulk operations with explicit `dryRun`
- 🛡️ `jira_preview_create_issue` — build create payloads without POSTing
- 🧾 `jira_get_audit_context` — compact issue audit context for LLM review
- 🔗 `jira_link_issues` — create links between issues
- 🔗 `jira_get_issue_links` / `jira_bulk_link_issues` — inspect or create multiple issue links
- 🧩 `jira_get_subtasks` / `jira_create_subtask` — inspect or create sub-tasks
- 🧬 `jira_clone_issue` — clone an issue with optional field overrides
- 👤 `jira_assign_issue` — assign issues by name or key
- 👥 `jira_find_user` — search Jira users for assignment/collaboration flows
- 📋 `jira_get_transitions` — list currently available transitions for an issue
- 📅 `jira_get_my_worklogs` — list the authenticated user's Tempo worklogs
- 📅 `jira_update_worklog` / `jira_delete_worklog` — correct or remove Tempo worklogs
- 📎 `jira_add_attachment` — upload workspace files as issue attachments
- 📤 `jira_upload_attachment_content` — attach AI-generated content (text, CSV, JSON…) directly without a local file
- 🗂️ `jira_get_projects` / `jira_get_components` / `jira_get_priorities` — discover common Jira metadata
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
| `fields` | `object` | Jira create fields keyed by standard field names or `customfield_*` IDs; `fields.description` accepts `string` or raw ADF |

**Output:** Confirmation with created issue key, summary, issue type, and browser URL.

---

### `jira_add_worklog`

Log work on a Jira issue through Tempo Timesheets.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `timeSpent` | `string` | Duration using `Nd`, `Nh`, `Nm` tokens |
| `startDate` | `string` | Optional work date in `yyyy-MM-dd` format |
| `comment` | `string` | Optional worklog comment |
| `process` | `string` | Optional Tempo Process attribute |
| `typeOfWork` | `string` | Optional Tempo Type Of Work attribute |

**Output:** Confirmation with issue details, worker, date, duration, and Tempo worklog IDs.

---

### `jira_add_comment`

Add a comment to a Jira issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `body` | `string \| object` | Comment body as plain text or raw ADF |

**Output:** Confirmation with comment id and browser URL.

---

### `jira_transition_issue`

Transition a Jira issue to a target workflow state.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `transitionId` | `string` | Optional Jira workflow transition id |
| `transitionName` | `string` | Optional transition name resolved from current available transitions |
| `comment` | `string \| object` | Optional plain text or ADF comment |
| `fields` | `object` | Optional curated field updates sent with the transition |

Provide exactly one of `transitionId` or `transitionName`.

**Output:** Confirmation with issue key, transition id, and browser URL.

---

### `jira_get_create_meta`

Return static create metadata for supported Jira issue types.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueTypeId` | `string` | Optional issue type id to narrow the result |

**Output:** Required fields, optional fields, and known option sets from `src/jira/constants.ts`.

---

### `jira_get_edit_meta`

Return live editable fields for a specific issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |

**Output:** Field IDs, labels, required flags, schema types, and allowed values returned by Jira.

---

### `jira_update_issue_fields`

Update a curated set of fields on an existing issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `fields` | `object` | Curated set of updateable field ids/values |

**Output:** Confirmation with updated field ids and browser URL.

---

### `jira_validate_issue_update`

Validate an issue update without writing.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `fields` | `object` | Curated update fields to validate |

**Output:** Validation status, normalized update payload, and any fields not editable according to live edit metadata.

---

### `jira_bulk_update_issue_fields`

Update fields on multiple issues with explicit dry-run control.

**Input:**
| Field | Type | Description |
|---|---|---|
| `dryRun` | `boolean` | Required. `true` previews only; `false` applies updates |
| `issues` | `array` | 1-25 items with `issueKey` and `fields` |

**Output:** Per-issue status table. Later items continue after per-issue failures.

---

### `jira_bulk_transition_issues`

Transition multiple issues with explicit dry-run control.

**Input:**
| Field | Type | Description |
|---|---|---|
| `dryRun` | `boolean` | Required. `true` resolves/previews only; `false` applies transitions |
| `issues` | `array` | 1-25 items with `issueKey`, exactly one of `transitionId`/`transitionName`, optional `comment` and `fields` |

**Output:** Per-issue status table with resolved transition ids. Later items continue after per-issue failures.

---

### `jira_preview_create_issue`

Build and validate a create issue payload without sending it to Jira.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueTypeId` | `string` | Jira issue type ID from `src/jira/constants.ts` |
| `fields` | `object` | Jira create fields keyed by standard field names or `customfield_*` IDs |

**Output:** Normalized Jira create payload JSON.

---

### `jira_get_audit_context`

Fetch compact context for LLM review of one issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `includeComments` | `boolean` | Include recent comments, default true |
| `maxComments` | `number` | Max comments, 1-100, default 20 |

**Output:** Issue summary, key fields, description, issue links, subtasks, and optional comments.

---

### `jira_link_issues`

Create a Jira issue link between two issues.

**Input:**
| Field | Type | Description |
|---|---|---|
| `inwardIssueKey` | `string` | Source issue key |
| `outwardIssueKey` | `string` | Target issue key |
| `linkType` | `string` | Jira link type name |
| `comment` | `string \| object` | Optional plain text or ADF comment |

**Output:** Confirmation with issue keys, link type, and link id.

---

### `jira_get_issue_links`

List issue links for a Jira issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |

**Output:** Link direction, type, relationship, linked issue key, summary, and status.

---

### `jira_get_subtasks`

List subtasks for a Jira issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Parent Jira issue key |

**Output:** Subtask key, summary, status, assignee, priority, and URL.

---

### `jira_create_subtask`

Create a subtask under a parent issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `parentIssueKey` | `string` | Parent Jira issue key |
| `issueTypeId` | `string` | Jira subtask issue type id for the project |
| `fields` | `object` | Jira create fields; `parent` and `issuetype` are injected |

**Output:** Confirmation with parent key, created subtask key, and browser URL.

---

### `jira_clone_issue`

Clone an issue by copying core fields.

**Input:**
| Field | Type | Description |
|---|---|---|
| `sourceIssueKey` | `string` | Source Jira issue key |
| `summaryPrefix` | `string` | Optional prefix, default `Clone of` |
| `fields` | `object` | Optional field overrides for the created issue |

**Output:** Confirmation with source key, cloned issue key, and browser URL.

---

### `jira_bulk_link_issues`

Create multiple issue links sequentially.

**Input:**
| Field | Type | Description |
|---|---|---|
| `links` | `array` | 1-25 link requests with `inwardIssueKey`, `outwardIssueKey`, `linkType`, optional `comment` |

**Output:** Per-link status table. If one link fails, later links are still attempted and the MCP result is marked as an error.

---

### `jira_assign_issue`

Assign a Jira issue to a user.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `assigneeName` | `string` | Optional Jira username/name |
| `assigneeKey` | `string` | Optional Jira internal user key |

**Output:** Confirmation with assignee and browser URL.

---

### `jira_find_user`

Search Jira users for assignment and collaboration flows.

**Input:**
| Field | Type | Description |
|---|---|---|
| `query` | `string` | Username, display name, or search text |
| `maxResults` | `number` | Max results (1-50, default 10) |

**Output:** Display name, username, user key, active flag, and email if Jira exposes it.

---

### `jira_get_transitions`

List the currently available workflow transitions for an issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |

**Output:** Transition ids, names, and destination statuses.

---

### `jira_update_comment`

Update an existing issue comment.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `commentId` | `string` | Jira comment id |
| `body` | `string \| object` | Replacement body as plain text or raw ADF |

**Output:** Confirmation with issue key, comment id, and browser URL.

---

### `jira_delete_comment`

Delete an issue comment by id.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `commentId` | `string` | Jira comment id |

**Output:** Confirmation with issue key and deleted comment id.

---

### `jira_get_my_worklogs`

List the authenticated user's Tempo worklogs.

**Input:**
| Field | Type | Description |
|---|---|---|
| `dateFrom` | `string` | Optional start date in `yyyy-MM-dd` format |
| `dateTo` | `string` | Optional end date in `yyyy-MM-dd` format |

**Output:** Tempo worklog ids, issue keys, dates, durations, and comments.

---

### `jira_update_worklog`

Update a Tempo worklog by id.

**Input:**
| Field | Type | Description |
|---|---|---|
| `worklogId` | `string` | Tempo worklog id |
| `timeSpent` | `string` | Optional duration using `Nd`, `Nh`, `Nm` tokens |
| `startDate` | `string` | Optional date in `yyyy-MM-dd` format |
| `comment` | `string` | Optional updated comment |
| `process` | `string` | Optional Tempo Process attribute |
| `typeOfWork` | `string` | Optional Tempo Type Of Work attribute |

**Output:** Confirmation with updated Tempo id, issue key, date, and duration.

---

### `jira_delete_worklog`

Delete a Tempo worklog by id.

**Input:**
| Field | Type | Description |
|---|---|---|
| `worklogId` | `string` | Tempo worklog id |

**Output:** Confirmation with deleted Tempo id.

---

### `jira_add_attachment`

Upload a local file from the allowed workspace directory to an issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `filePath` | `string` | Path to a file inside the `ATTACHMENT_WORKSPACE` directory |

Files outside the configured `ATTACHMENT_WORKSPACE` are rejected. Set the env var to restrict the allowed root directory.

**Output:** Uploaded attachment ids, filenames, sizes, and issue URL.

---

### `jira_upload_attachment_content`

Upload in-memory content as a Jira issue attachment — no local file needed.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueKey` | `string` | Jira issue key |
| `filename` | `string` | Filename with extension, e.g. `report.md`, `data.csv` |
| `content` | `string` | Plain text (utf8) or base64-encoded content |
| `encoding` | `"utf8" \| "base64"` | Default `utf8` |
| `mimeType` | `string` | Optional MIME type override; inferred from extension if omitted |

**Output:** Uploaded attachment id, filename, size, MIME type, and issue URL.

---

### `jira_get_projects`

List Jira projects visible to the authenticated user.

**Input:** none.

**Output:** Project keys, names, ids, and browser URLs.

---

### `jira_get_components`

List components for a Jira project.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectKey` | `string` | Jira project key |

**Output:** Component ids, names, and descriptions.

---

### `jira_get_priorities`

List Jira priorities configured in the instance.

**Input:** none.

**Output:** Priority ids, names, and descriptions.

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
│   ├── adf.ts             # Shared ADF normalization helpers
│   ├── create-meta.ts     # Static issue create metadata helpers
│   ├── create-issue.ts    # Create-issue validation and payload helpers
│   ├── edit-meta.ts       # Live issue edit metadata normalization
│   ├── user-search.ts     # User search normalization
│   ├── transition-resolution.ts # Transition name resolution
│   ├── update-issue.ts    # Curated field update normalization
│   └── http-client.ts     # Cookie-authenticated Jira HTTP client
├── tools/
│   ├── add-attachment.ts  # jira_add_attachment handler
│   ├── add-comment.ts     # jira_add_comment handler
│   ├── bulk-link-issues.ts # jira_bulk_link_issues handler
│   ├── clone-issue.ts     # jira_clone_issue handler
│   ├── create-subtask.ts  # jira_create_subtask handler
│   ├── get-issue.ts       # jira_get_issue handler
│   ├── get-issue-links.ts # jira_get_issue_links handler
│   ├── get-subtasks.ts    # jira_get_subtasks handler
│   ├── find-user.ts       # jira_find_user handler
│   ├── get-components.ts  # jira_get_components handler
│   ├── get-create-meta.ts # jira_get_create_meta handler
│   ├── get-edit-meta.ts   # jira_get_edit_meta handler
│   ├── get-my-worklogs.ts # jira_get_my_worklogs handler
│   ├── get-priorities.ts  # jira_get_priorities handler
│   ├── get-projects.ts    # jira_get_projects handler
│   ├── get-transitions.ts # jira_get_transitions handler
│   ├── link-issues.ts     # jira_link_issues handler
│   ├── assign-issue.ts    # jira_assign_issue handler
│   ├── delete-comment.ts  # jira_delete_comment handler
│   ├── delete-worklog.ts  # jira_delete_worklog handler
│   ├── search-issues.ts   # jira_search_issues handler
│   ├── add-worklog.ts     # jira_add_worklog handler
│   ├── transition-issue.ts # jira_transition_issue handler
│   ├── update-comment.ts  # jira_update_comment handler
│   ├── update-issue-fields.ts # jira_update_issue_fields handler
│   ├── update-worklog.ts  # jira_update_worklog handler
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
