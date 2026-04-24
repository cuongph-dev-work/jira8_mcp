# Jira Write Tools Suite Design

## Goal

Extend `jira-run-mcp` from the current read/create/worklog baseline into a broader Jira write-capable MCP server for the internal Jira 8 instance.

This phase adds eight new tools plus a README contract refresh:

1. `jira_transition_issue`
2. `jira_add_comment`
3. `jira_get_create_meta`
4. `jira_update_issue_fields`
5. `jira_link_issues`
6. `jira_assign_issue`
7. `jira_get_transitions`
8. `jira_get_my_worklogs`

## Scope

This phase includes:

- README update so public documentation matches the actual exposed tools, including `jira_add_worklog`
- New Jira REST endpoint builders for transitions, comments, links, assignment, and worklog reads
- New HTTP client methods for the eight tools
- New tool handlers in `src/tools/`
- Reuse of current session/auth model via `loadAndValidateSession()`
- Reuse of current normalization approach for ADF-backed text fields
- Static create metadata sourced from `src/jira/constants.ts`
- Tests and docs for all new tools

This phase excludes:

- Dynamic create metadata fetched live from Jira
- Browser-driven Jira write automation
- Bulk operations across multiple issues in a single tool call
- Generic arbitrary Jira REST passthrough tools
- Workflow discovery beyond current issue transitions

## Constraints

- The project must remain HTTP-first. Playwright stays limited to SSO bootstrap.
- The repo already has clear tool isolation: handlers in `src/tools/`, transport in `src/jira/http-client.ts`, and endpoint builders in `src/jira/endpoints.ts`.
- The Jira instance is internal and schema-heavy, so stable field metadata should continue to live in `src/jira/constants.ts`.
- Errors must keep using `McpError` and return `isError: true`.
- TypeScript strict mode and `.js` ESM imports remain mandatory.

## Recommended Approach

Implement the eight tools on top of a shared write-capability layer in `src/jira/`, not as isolated handler-only features.

The core principle is:

- tool handlers own schema validation, auth guard, and response formatting
- `http-client.ts` owns network calls and response-shape validation
- focused helper modules own normalization and payload assembly for fields, ADF bodies, transitions, and static metadata formatting

This keeps the codebase aligned with the existing architecture and avoids duplicating Jira payload rules across eight handlers.

## Alternatives Considered

### 1. Independent tool-by-tool implementation

Each tool would build payloads inline in the handler and call raw HTTP methods directly.

Pros:

- Fastest initial coding
- Minimal up-front design

Cons:

- Repeats session/error/ADF logic
- Harder to test consistently
- Increases drift between tools

### 2. Shared write-capability layer

Add a few focused helpers and expand `http-client.ts` with typed methods.

Pros:

- Matches current architecture
- Reuses normalization rules across tools
- Makes docs/tests more consistent

Cons:

- Slightly more design work before coding

### 3. One generic write tool with action verbs

Expose one tool that accepts `operation: "comment" | "transition" | ...`.

Pros:

- Smaller surface area

Cons:

- Poor MCP ergonomics
- Harder for LLMs to call correctly
- Weak contracts and validation

### Recommendation

Use option 2. It is the smallest approach that still scales cleanly to eight user-facing tools.

## Tool Set

### `jira_transition_issue`

Purpose:

- Move an issue to a valid next workflow state

Input:

- `issueKey`
- `transitionId`
- optional `comment`
- optional `fields`

Behavior:

- Fetch issue transitions when necessary only if validation needs richer messaging
- POST transition payload to Jira
- If `comment` is provided, normalize `string | ADF` to Jira comment body format
- If `fields` are provided, apply the same field normalization rules as `jira_update_issue_fields`

Output:

- issue key
- transition id
- transition name if available
- browser URL

### `jira_add_comment`

Purpose:

- Add a comment to an issue

Input:

- `issueKey`
- `body` supporting `string | ADF`

Behavior:

- Convert string comments to minimal ADF
- Pass raw ADF through after shape validation

Output:

- issue key
- comment id
- URL

### `jira_get_create_meta`

Purpose:

- Expose static issue-type metadata from `src/jira/constants.ts`

Input:

- optional `issueTypeId`

Behavior:

- No Jira API call
- Return issue types, required fields, optional fields, and known option maps from constants
- If `issueTypeId` is present, return only that slice

Output:

- issue type id and label
- required field ids
- optional field ids
- known enum/radio/select options when available

### `jira_update_issue_fields`

Purpose:

- Update mutable fields on an existing issue

Input:

- `issueKey`
- `fields`

Behavior:

- Reuse description normalization from create flow
- Only allow a curated field set in v1
- Send `PUT /rest/api/2/issue/{key}`

Output:

- issue key
- updated field names
- URL

### `jira_link_issues`

Purpose:

- Create a Jira issue link between two issues

Input:

- `inwardIssueKey`
- `outwardIssueKey`
- `linkType`
- optional `comment`

Behavior:

- POST Jira issue-link payload
- Accept only supported link types in schema or via internal allowlist

Output:

- both issue keys
- link type

### `jira_assign_issue`

Purpose:

- Assign an issue to a user

Input:

- `issueKey`
- either `assigneeName` or `assigneeKey`

Behavior:

- Prefer the identity format the Jira 8 instance accepts
- Keep contract explicit so the tool can reject ambiguous inputs

Output:

- issue key
- assigned user

### `jira_get_transitions`

Purpose:

- Read valid workflow transitions for an issue

Input:

- `issueKey`

Behavior:

- GET transitions endpoint

Output:

- transition ids
- names
- destination statuses when available

### `jira_get_my_worklogs`

Purpose:

- Read the current authenticated user's Tempo worklogs

Input:

- optional `dateFrom`
- optional `dateTo`

Behavior:

- Resolve current user first
- Query Tempo worklogs for that worker in a bounded date range

Output:

- worker identity
- date range
- worklog list with issue key, time spent, date, comment, process, and type of work when available

## Shared Design Decisions

### ADF Normalization

The current server already normalizes `description` for `jira_create_issue`. Extend the same policy to:

- `jira_add_comment.body`
- `jira_transition_issue.comment`
- `jira_update_issue_fields.fields.description`

Rules:

- `string` becomes minimal ADF `doc -> paragraph -> text`
- valid ADF document object passes through
- other values return `INVALID_INPUT`

### Static Create Metadata

`jira_get_create_meta` will use `src/jira/constants.ts` only.

Reason:

- stable and fast
- aligned with the internal Jira form metadata already curated in-repo
- avoids live Jira metadata drift for the first release

### Update Field Safety

`jira_update_issue_fields` should not allow arbitrary field ids in v1.

It should use an explicit allowlist:

- common standard fields such as `summary`, `description`, `priority`, `duedate`, `labels`, `components`
- selected custom fields already understood by the server

This is narrower than create because update safety matters more than breadth in early rollout.

### Identity Handling

Where Jira requires the current user:

- reuse `getCurrentUser()` from `http-client.ts`

Where assignment requires another user:

- accept explicit input fields and fail clearly if the chosen identity shape is not supported by the instance
- avoid adding user search or fuzzy matching in this phase

## File Structure

### New/Modified Jira Access Layer Files

- `src/jira/endpoints.ts`
  - add URL builders for transitions, comments, links, assignment, update issue, and Tempo worklog queries
- `src/jira/http-client.ts`
  - add typed methods for each new endpoint
- `src/jira/create-meta.ts`
  - static metadata formatting from constants
- `src/jira/update-issue.ts`
  - normalize allowed update fields and description ADF handling
- `src/jira/adf.ts`
  - shared ADF validator/builder reused by comment/description paths
- `src/jira/transitions.ts`
  - optional transition payload/result helpers if response formatting becomes repetitive

### New Tool Files

- `src/tools/transition-issue.ts`
- `src/tools/add-comment.ts`
- `src/tools/get-create-meta.ts`
- `src/tools/update-issue-fields.ts`
- `src/tools/link-issues.ts`
- `src/tools/assign-issue.ts`
- `src/tools/get-transitions.ts`
- `src/tools/get-my-worklogs.ts`

### Docs

- update `README.md`
- add one file per tool under `docs/tools/`

### Tests

- `src/tests/write-tools.test.ts`
  - schema/unit coverage for the new tools
- `src/tests/http-client-write.test.ts`
  - focused HTTP method coverage
- extend `src/tests/regression.test.ts`
  - auth failure stays `isError: true` for new tools

If splitting test files more narrowly is cleaner during implementation, that is acceptable as long as each tool gets explicit coverage.

## API Surface Expectations

Planned Jira/Tempo calls:

- `GET /rest/api/2/issue/{issueKey}/transitions`
- `POST /rest/api/2/issue/{issueKey}/transitions`
- `POST /rest/api/2/issue/{issueKey}/comment`
- `PUT /rest/api/2/issue/{issueKey}`
- `POST /rest/api/2/issueLink`
- `PUT /rest/api/2/issue/{issueKey}/assignee`
- `GET /rest/api/2/myself`
- Tempo worklog read endpoint matching the installed Tempo Timesheets version

If the Tempo read endpoint differs from the assumed path, adjust only that tool; do not block the Jira tools on Tempo read-path discovery.

## Error Handling

Use current error taxonomy where possible:

- `AUTH_REQUIRED`
- `SESSION_EXPIRED`
- `JIRA_HTTP_ERROR`
- `JIRA_RESPONSE_ERROR`
- `INVALID_INPUT`

Rules:

- business validation returns `INVALID_INPUT`
- unexpected Jira response shape returns `JIRA_RESPONSE_ERROR`
- auth/session failure always maps to `isError: true`

## Testing Strategy

For each tool:

1. schema accepts valid input
2. schema rejects invalid input
3. handler returns `isError: true` on auth failure
4. HTTP client validates success response shape
5. ADF normalization is covered where applicable

Global verification:

- `npx tsc --noEmit`
- `npx vitest run`

## Rollout Order

Implement in this exact user-facing order:

1. Update `README.md` so the current public contract is accurate
2. `jira_transition_issue`
3. `jira_add_comment`
4. `jira_get_create_meta`
5. `jira_update_issue_fields`
6. `jira_link_issues`
7. `jira_assign_issue`
8. `jira_get_transitions`
9. `jira_get_my_worklogs`

This order prioritizes high-value write actions first and leaves the Tempo read path last, since it has the highest risk of path/version mismatch.

## Risks

### Risk: Jira workflow field requirements during transitions

Some transitions may require fields that are not universal.

Mitigation:

- allow optional `fields` in `jira_transition_issue`
- preserve clear error surfacing from Jira if the transition rejects missing fields

### Risk: Assignment identity format differs by Jira configuration

Some Jira 8 instances want `name`, others `key`.

Mitigation:

- design the tool contract to accept explicit identity input
- implement the format that the current instance accepts first
- fail clearly if the alternate format is unsupported

### Risk: Tempo read endpoint may not match write endpoint family exactly

Mitigation:

- isolate Tempo read logic into its own tool
- do not couple other seven tools to Tempo read success

### Risk: Over-broad update tool could become unsafe

Mitigation:

- use an allowlist for updateable fields in v1
- add breadth later only after real usage proves the need

## Success Criteria

- README matches the actual exposed tool list
- all eight tools are exposed via `src/server.ts`
- each tool has docs and tests
- all write/read operations remain HTTP-first and session-guarded
- ADF-backed fields accept both plain string and raw ADF where intended
- full typecheck and test suite pass
