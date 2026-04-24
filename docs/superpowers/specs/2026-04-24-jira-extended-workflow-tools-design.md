# Jira Extended Workflow Tools Design

## Goal

Add the next layer of Jira capabilities on top of the current MCP server so agents can discover valid targets more reliably, complete full comment/worklog lifecycles, and work with more Jira metadata without leaving the HTTP-first architecture.

This phase adds ten capabilities:

1. `jira_find_user`
2. `jira_get_edit_meta`
3. `jira_transition_issue` support for `transitionName`
4. `jira_update_comment`
5. `jira_delete_comment`
6. `jira_update_worklog`
7. `jira_delete_worklog`
8. `jira_add_attachment`
9. `jira_get_projects`
10. `jira_get_components`
11. `jira_get_priorities`

## Scope

This phase includes:

- User discovery for safer assignment and collaboration flows
- Edit metadata discovery for safer update and transition flows
- Transition-by-name support layered on top of current transition-by-id support
- Full comment lifecycle: create, update, delete
- Full worklog lifecycle: create, read, update, delete
- Attachment upload support
- Lightweight project/component/priority discovery helpers
- Matching docs and tests

This phase excludes:

- Browser-driven attachment upload
- Bulk attachment upload in a single call
- Bulk worklog/comment operations
- Generic Jira admin/configuration tools
- Dynamic create metadata replacement for the existing static create-meta approach

## Decomposition

The work is intentionally split into four independent subprojects.

### Subproject 1: Discovery Helpers

Purpose:

- reduce tool-call failure by letting the agent discover valid users, editable fields, and transition names before writing

Tools:

- `jira_find_user`
- `jira_get_edit_meta`
- `jira_transition_issue` enhancement for `transitionName`

### Subproject 2: Comment Lifecycle

Purpose:

- complete the existing comment flow so agents can revise or remove comments they created or referenced

Tools:

- `jira_update_comment`
- `jira_delete_comment`

### Subproject 3: Worklog Lifecycle

Purpose:

- complement current add/read worklog support with correction and rollback operations

Tools:

- `jira_update_worklog`
- `jira_delete_worklog`

### Subproject 4: Metadata and Attachments

Purpose:

- let agents attach generated artifacts and discover common Jira metadata without hardcoding IDs everywhere

Tools:

- `jira_add_attachment`
- `jira_get_projects`
- `jira_get_components`
- `jira_get_priorities`

## Recommended Approach

Keep the existing architectural pattern:

- `src/tools/` owns Zod schemas, auth guards, and human-readable formatting
- `src/jira/http-client.ts` owns transport and response-shape validation
- `src/jira/endpoints.ts` owns endpoint builders
- small helper modules under `src/jira/` own normalization and metadata formatting

Do not build a generic “admin” or “misc write” tool. Keep the surface area explicit and LLM-friendly.

## Alternatives Considered

### 1. One large generic metadata/write tool

Pros:

- fewer handlers

Cons:

- weak contracts
- poor LLM ergonomics
- harder validation

### 2. Explicit task-specific tools

Pros:

- clearer inputs
- better validation
- easier docs and tests

Cons:

- more files

### Recommendation

Use explicit tools. The codebase already benefits from this pattern.

## Shared Design Decisions

### User Identity Discovery

`jira_find_user` should return a normalized list with enough identity fields to feed `jira_assign_issue` later:

- display name
- login name
- internal key if available

The tool should remain search-oriented, not fuzzy auto-assigning.

### Edit Metadata

`jira_get_edit_meta` should expose:

- editable field IDs
- field labels when available
- required flags when Jira exposes them
- allowed values for fields that publish options

This tool should use live Jira edit metadata, unlike `jira_get_create_meta`, because editability is issue-specific.

### Transition by Name

`jira_transition_issue` should accept either:

- `transitionId`
- or `transitionName`

If `transitionName` is provided:

- resolve against current transitions for that issue
- require exactly one case-insensitive match
- return `INVALID_INPUT` if zero or multiple matches are found

### Comment Bodies

`jira_update_comment` should reuse the same `string | ADF` normalization already used by create/transition/add-comment.

### Worklog Updates

`jira_update_worklog` should stay conservative:

- support date, duration, comment, and known Tempo attributes
- avoid exposing every Tempo field until needed

### Attachment Upload

`jira_add_attachment` should accept a local file path only if the file is within accessible workspace paths.

The tool should:

- read the file
- upload it to Jira with the required attachment header
- return attachment name, size, and issue URL

It should not try to infer issue context from the file name.

### Project/Component/Priority Discovery

These tools are discovery-oriented and should stay read-only, lightweight, and easy to cache mentally:

- `jira_get_projects`: project key, name, URL if derivable
- `jira_get_components`: components for a project key
- `jira_get_priorities`: name/id pairs for the current Jira instance

## File Structure

### New/Modified Jira Layer

- `src/jira/endpoints.ts`
  - user search
  - edit meta
  - comment update/delete
  - Tempo worklog update/delete
  - attachment upload
  - project/component/priority discovery
- `src/jira/http-client.ts`
  - typed methods for each new endpoint
- `src/jira/transition-resolution.ts`
  - resolve `transitionName` to `transitionId`
- `src/jira/edit-meta.ts`
  - normalize live edit metadata
- `src/jira/user-search.ts`
  - normalize user search results

### New Tool Files

- `src/tools/find-user.ts`
- `src/tools/get-edit-meta.ts`
- `src/tools/update-comment.ts`
- `src/tools/delete-comment.ts`
- `src/tools/update-worklog.ts`
- `src/tools/delete-worklog.ts`
- `src/tools/add-attachment.ts`
- `src/tools/get-projects.ts`
- `src/tools/get-components.ts`
- `src/tools/get-priorities.ts`

### Docs

- one `docs/tools/*.md` file per new tool
- update `README.md`

### Tests

- extend `src/tests/http-client-write.test.ts`
- extend `src/tests/write-tools.test.ts`
- extend `src/tests/regression.test.ts`
- add a focused attachment-path test file if file upload handling becomes large

## API Expectations

Planned families of endpoints:

- Jira user search endpoint suitable for Jira 8
- `editmeta` or issue edit metadata endpoint for a specific issue
- comment update/delete endpoints under issue comment resources
- Tempo worklog update/delete endpoints matching current Tempo version
- Jira attachment upload endpoint
- Jira project/component/priority read endpoints

If one endpoint family differs in the live Jira 8 instance:

- isolate the adjustment in `http-client.ts`
- do not redesign tool contracts unless the endpoint shape forces it

## Risks

### Risk: Jira 8 user search endpoint shape varies

Mitigation:

- normalize aggressively in `src/jira/user-search.ts`
- expose only stable fields in tool output

### Risk: Edit metadata can be noisy and very large

Mitigation:

- summarize by default
- optionally filter by issue field when user provides one later in a follow-up enhancement

### Risk: Tempo update/delete semantics may differ from create/read

Mitigation:

- keep Tempo lifecycle isolated in its own subproject
- validate response shapes tightly

### Risk: Attachment upload needs special headers

Mitigation:

- handle upload only in `http-client.ts`
- do not duplicate multipart logic in handlers

## Rollout Order

Implement in this order:

1. Discovery helpers
2. Comment lifecycle
3. Worklog lifecycle
4. Metadata and attachments

This order maximizes immediate agent usability before adding the heavier file-upload and Tempo-mutation pieces.

## Success Criteria

- New discovery tools reduce hardcoded IDs/names in agent flows
- Comments and worklogs both have full lifecycle coverage
- Transition by name works safely
- Attachment upload works for local workspace files
- Project/component/priority lookup tools are available
- Typecheck and tests pass
