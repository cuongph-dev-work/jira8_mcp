# Jira Create Issue Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new MCP tool `jira_create_issue` that creates Jira issues through `POST /rest/api/2/issue`, validates required and optional fields by `issueTypeId`, and uses `src/jira/constants.ts` as the single source of truth for field allowlists.

**Architecture:** Keep the existing separation intact: tool handler in `src/tools/`, Jira REST call in `src/jira/http-client.ts`, and field metadata in `src/jira/constants.ts`. Validation should be HTTP-first and session-aware like the existing read-only tools; Playwright remains auth bootstrap only.

**Tech Stack:** TypeScript strict mode, Zod, Axios, Vitest, MCP SDK, Express.

---

## File Map

- Modify: `src/jira/constants.ts`
  Add optional-field metadata next to `REQUIRED_FIELDS`, plus small helpers to resolve an issue-type label and compute the allowlist for a given `issueTypeId`.
- Create: `src/jira/create-issue.ts`
  Keep create-issue-specific validation and payload normalization out of `src/tools/create-issue.ts` so the tool stays thin.
- Modify: `src/jira/endpoints.ts`
  Add the create-issue REST endpoint builder.
- Modify: `src/jira/http-client.ts`
  Add `createIssue()` using the same auth-failure and response-shape rules as the existing methods.
- Modify: `src/types.ts`
  Add the stable create-result type returned from the Jira client/tool formatter.
- Create: `src/tools/create-issue.ts`
  Add Zod schema, session guard, create flow, and markdown response formatter.
- Modify: `src/server.ts`
  Register the new `jira_create_issue` MCP tool.
- Create: `src/tests/create-issue.test.ts`
  Add focused tests for validation, payload building, and handler behavior.
- Modify: `src/tests/regression.test.ts`
  Extend regression coverage so auth failures from `jira_create_issue` also return `isError: true`.
- Modify: `src/tests/tools.test.ts`
  Add schema validation coverage for `createIssueSchema`.
- Create: `docs/tools/jira_create_issue.md`
  Document the tool contract, issue-type-driven field rules, and example payloads.
- Modify: `README.md`
  Add the new tool to the public tool list and example usage.

### Task 1: Lock Field Metadata and Validation Rules

**Files:**
- Test: `src/tests/create-issue.test.ts`
- Modify: `src/jira/constants.ts`
- Create: `src/jira/create-issue.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write the failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { ISSUE_TYPE, FIELD, CUSTOM_FIELD } from "../jira/constants.js";
import {
  buildCreateIssuePayload,
  validateCreateIssueFields,
} from "../jira/create-issue.js";

describe("validateCreateIssueFields", () => {
  it("accepts a Task payload with required fields only", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.TASK, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Implement MCP create tool",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      })
    ).not.toThrow();
  });

  it("rejects a Bug payload when a required field is missing", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.BUG, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Production defect",
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      })
    ).toThrow(/Missing required fields: customfield_10335, customfield_10323/);
  });

  it("rejects fields that are not allowed for the selected issue type", () => {
    expect(() =>
      validateCreateIssueFields(ISSUE_TYPE.TASK, {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Task carrying a risk-only field",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
        [CUSTOM_FIELD.RISK_OWNER]: { name: "Alice Smith" },
      })
    ).toThrow(/Unsupported fields for issue type 10000: customfield_10731/);
  });
});

describe("buildCreateIssuePayload", () => {
  it("injects issuetype.id from the selected issueTypeId", () => {
    const payload = buildCreateIssuePayload(ISSUE_TYPE.BUG, {
      [FIELD.PROJECT]: { key: "DNIEM" },
      [FIELD.SUMMARY]: "Prod bug",
      [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
      [CUSTOM_FIELD.DEGRADE]: { id: "10000" },
      [FIELD.DUE_DATE]: "2026-04-30",
      [CUSTOM_FIELD.DEFECT_TYPE]: { id: "10100" },
    });

    expect(payload.fields[FIELD.ISSUE_TYPE]).toEqual({ id: ISSUE_TYPE.BUG });
  });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npx vitest run src/tests/create-issue.test.ts`

Expected: FAIL with module-not-found errors for `src/jira/create-issue.ts` and missing exports from `src/jira/constants.ts`.

- [ ] **Step 3: Implement field metadata and validation helpers**

```ts
// src/jira/constants.ts
export const ISSUE_TYPE_LABEL: Record<IssueTypeId, string> = {
  [ISSUE_TYPE.EPIC]: "Epic",
  [ISSUE_TYPE.STORY]: "Story",
  [ISSUE_TYPE.TASK]: "Task",
  [ISSUE_TYPE.IMPROVEMENT]: "Improvement",
  [ISSUE_TYPE.BUG]: "Bug",
  [ISSUE_TYPE.BUG_CUSTOMER]: "Bug_Customer",
  [ISSUE_TYPE.LEAKAGE]: "Leakage",
  [ISSUE_TYPE.QA]: "QA",
  [ISSUE_TYPE.CHANGE_REQUEST]: "Change Request",
  [ISSUE_TYPE.RISK]: "Risk",
  [ISSUE_TYPE.OPPORTUNITY]: "Opportunity",
  [ISSUE_TYPE.ISSUE]: "Issue",
  [ISSUE_TYPE.NEW_FEATURE]: "New Feature",
  [ISSUE_TYPE.LESSON_PRACTICE]: "Lesson Practice",
  [ISSUE_TYPE.DELIVERABLE]: "Deliverable",
  [ISSUE_TYPE.COMTOR_TASK]: "Comtor Task",
  [ISSUE_TYPE.FEEDBACK]: "Feedback",
  [ISSUE_TYPE.DEPENDENCY]: "Dependency",
  [ISSUE_TYPE.PROJECT_TRAINING]: "Project Training",
  [ISSUE_TYPE.NC]: "NC",
  [ISSUE_TYPE.INCIDENT]: "Incident",
  [ISSUE_TYPE.MA]: "MA",
  [ISSUE_TYPE.REVIEW_COMMENT]: "Review Comment",
  [ISSUE_TYPE.REVIEW_DEFECT]: "Review Defect",
};

export const COMMON_OPTIONAL_FIELDS = [
  FIELD.DESCRIPTION,
  FIELD.ASSIGNEE,
  FIELD.PRIORITY,
  FIELD.COMPONENTS,
  FIELD.LABELS,
  FIELD.FIX_VERSIONS,
  FIELD.AFFECTS_VERSIONS,
  FIELD.TIME_TRACKING,
] as const;

const BUG_FAMILY_OPTIONAL_FIELDS = [
  CUSTOM_FIELD.DEFECT_OWNER,
  CUSTOM_FIELD.DEFECT_ORIGIN,
  CUSTOM_FIELD.CAUSE_CATEGORY,
  CUSTOM_FIELD.SEVERITY,
  CUSTOM_FIELD.IMPACT_ASSESSMENT,
  CUSTOM_FIELD.CAUSE_ANALYSIS,
  CUSTOM_FIELD.ACTION,
  CUSTOM_FIELD.DOD,
] as const;

const RISK_OPTIONAL_FIELDS = [
  CUSTOM_FIELD.HANDLING_OPTION,
  CUSTOM_FIELD.CONTROL_MEASURES,
  CUSTOM_FIELD.CONTINGENCY_ACTION,
] as const;

const EPIC_OPTIONAL_FIELDS = [CUSTOM_FIELD.EPIC_NAME] as const;

export const OPTIONAL_FIELDS: Record<IssueTypeId, readonly string[]> = {
  [ISSUE_TYPE.TASK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.BUG]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.BUG_CUSTOMER]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.LEAKAGE]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.STORY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.IMPROVEMENT]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.DELIVERABLE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.EPIC]: [...COMMON_OPTIONAL_FIELDS, ...EPIC_OPTIONAL_FIELDS],
  [ISSUE_TYPE.QA]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.CHANGE_REQUEST]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.FEEDBACK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.INCIDENT]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.RISK]: [...COMMON_OPTIONAL_FIELDS, ...RISK_OPTIONAL_FIELDS],
  [ISSUE_TYPE.REVIEW_COMMENT]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.OPPORTUNITY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.ISSUE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.NEW_FEATURE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.LESSON_PRACTICE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.COMTOR_TASK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.DEPENDENCY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.PROJECT_TRAINING]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.NC]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.MA]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.REVIEW_DEFECT]: COMMON_OPTIONAL_FIELDS,
};

export function getAllowedFields(issueTypeId: IssueTypeId): readonly string[] {
  return [...REQUIRED_FIELDS[issueTypeId], ...OPTIONAL_FIELDS[issueTypeId]];
}
```

```ts
// src/jira/create-issue.ts
import {
  FIELD,
  ISSUE_TYPE_LABEL,
  REQUIRED_FIELDS,
  getAllowedFields,
  type IssueTypeId,
} from "./constants.js";

export interface JiraCreateIssuePayload {
  fields: Record<string, unknown>;
}

export interface JiraCreateIssueResult {
  id: string;
  key: string;
  url: string;
  issueTypeId: IssueTypeId;
  issueType: string;
  summary: string;
}

export function validateCreateIssueFields(
  issueTypeId: IssueTypeId,
  fields: Record<string, unknown>
): void {
  const requiredFields = REQUIRED_FIELDS[issueTypeId].filter(
    (fieldId) => fieldId !== FIELD.ISSUE_TYPE
  );
  const missing = requiredFields.filter((fieldId) => fields[fieldId] == null);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  const allowedFields = new Set(getAllowedFields(issueTypeId));
  const unsupported = Object.keys(fields).filter((fieldId) => !allowedFields.has(fieldId));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported fields for issue type ${issueTypeId}: ${unsupported.join(", ")}`
    );
  }
}

export function buildCreateIssuePayload(
  issueTypeId: IssueTypeId,
  fields: Record<string, unknown>
): JiraCreateIssuePayload {
  validateCreateIssueFields(issueTypeId, fields);

  return {
    fields: {
      ...fields,
      [FIELD.ISSUE_TYPE]: { id: issueTypeId },
    },
  };
}

export function buildCreateIssueResult(
  baseUrl: string,
  created: { id: string; key: string },
  issueTypeId: IssueTypeId,
  summary: string
): JiraCreateIssueResult {
  return {
    id: created.id,
    key: created.key,
    url: `${baseUrl.replace(/\\/$/, "")}/browse/${created.key}`,
    issueTypeId,
    issueType: ISSUE_TYPE_LABEL[issueTypeId],
    summary,
  };
}
```

```ts
// src/types.ts
export interface JiraCreatedIssueTransportResult {
  id: string;
  key: string;
  url: string;
}

export interface JiraCreatedIssue {
  id: string;
  key: string;
  url: string;
  issueTypeId: string;
  issueType: string;
  summary: string;
}
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `npx vitest run src/tests/create-issue.test.ts`

Expected: PASS for the validation and payload-builder cases.

- [ ] **Step 5: Commit the metadata baseline**

```bash
git add src/jira/constants.ts src/jira/create-issue.ts src/types.ts src/tests/create-issue.test.ts
git commit -m "feat: add create-issue field validation helpers"
```

### Task 2: Add Jira REST Support for Issue Creation

**Files:**
- Test: `src/tests/create-issue.test.ts`
- Modify: `src/jira/endpoints.ts`
- Modify: `src/jira/http-client.ts`

- [ ] **Step 1: Add failing client tests for `POST /issue`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { JiraHttpClient } from "../jira/http-client.js";

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        get: vi.fn(),
        post: vi.fn(),
      })),
    },
  };
});

describe("JiraHttpClient.createIssue", () => {
  const BASE_URL = "https://jira.example.com";
  const cookies = { cookieHeader: "JSESSIONID=abc" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the created issue key and browser URL", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 201,
      data: { id: "10001", key: "DNIEM-42", self: `${BASE_URL}/rest/api/2/issue/10001` },
    });

    const created = await client.createIssue({
      fields: { project: { key: "DNIEM" }, summary: "Create tool" },
    });

    expect(created).toEqual({
      id: "10001",
      key: "DNIEM-42",
      url: `${BASE_URL}/browse/DNIEM-42`,
    });
  });

  it("treats Jira redirects as expired session during create", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 302,
      data: "<html>login</html>",
    });

    await expect(
      client.createIssue({ fields: { project: { key: "DNIEM" }, summary: "Create tool" } })
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});
```

- [ ] **Step 2: Run the focused client tests to confirm failure**

Run: `npx vitest run src/tests/create-issue.test.ts -t "JiraHttpClient.createIssue"`

Expected: FAIL because `createIssue()` and `createIssueUrl()` do not exist yet.

- [ ] **Step 3: Implement the create endpoint and HTTP client method**

```ts
// src/jira/endpoints.ts
export function createIssueUrl(baseUrl: string): string {
  return `${baseUrl}${API_BASE}/issue`;
}
```

```ts
// src/jira/http-client.ts
import { createIssueUrl, issueUrl, searchUrl, ISSUE_FIELDS, SEARCH_FIELDS } from "./endpoints.js";
import type {
  JiraCreatedIssueTransportResult,
  JiraIssue,
  JiraSearchResult,
  SessionCookies,
} from "../types.js";

async createIssue(
  payload: { fields: Record<string, unknown> }
): Promise<JiraCreatedIssueTransportResult> {
  const url = createIssueUrl(this.baseUrl);
  const res = await this.http.post(url, payload);

  this.checkForAuthFailure(res.status, url, res.data);
  this.assertOk(res.status, url, res.data);

  const body = res.data as { id?: string; key?: string };
  if (!body || typeof body.id !== "string" || typeof body.key !== "string") {
    throw jiraResponseError("Unexpected create issue response shape", body);
  }

  return {
    id: body.id,
    key: body.key,
    url: `${this.baseUrl}/browse/${body.key}`,
  };
}
```

- [ ] **Step 4: Run the focused client tests to verify they pass**

Run: `npx vitest run src/tests/create-issue.test.ts -t "JiraHttpClient.createIssue"`

Expected: PASS for 201 success and 302 auth-expired handling.

- [ ] **Step 5: Commit the HTTP layer**

```bash
git add src/jira/endpoints.ts src/jira/http-client.ts src/tests/create-issue.test.ts
git commit -m "feat: add Jira HTTP client support for issue creation"
```

### Task 3: Add the MCP Tool, Schema, and Server Registration

**Files:**
- Modify: `src/tests/tools.test.ts`
- Modify: `src/tests/regression.test.ts`
- Modify: `src/tests/create-issue.test.ts`
- Create: `src/tools/create-issue.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write the failing schema and handler tests**

```ts
// src/tests/tools.test.ts
import { createIssueSchema } from "../tools/create-issue.js";
import { ISSUE_TYPE, FIELD, CUSTOM_FIELD } from "../jira/constants.js";

describe("createIssueSchema", () => {
  it("accepts a valid create request", () => {
    const result = createIssueSchema.safeParse({
      issueTypeId: ISSUE_TYPE.TASK,
      fields: {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Create MCP tool",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported issueTypeId", () => {
    const result = createIssueSchema.safeParse({
      issueTypeId: "99999",
      fields: {},
    });

    expect(result.success).toBe(false);
  });
});
```

```ts
// src/tests/regression.test.ts
it("jira_create_issue returns isError:true when session is missing", async () => {
  const { handleCreateIssue } = await import("../tools/create-issue.js");
  const result = await handleCreateIssue(
    {
      issueTypeId: "10000",
      fields: {
        project: { key: "DNIEM" },
        summary: "Create issue",
        customfield_10401: { id: "10400" },
        customfield_10339: [{ id: "10300" }],
        duedate: "2026-04-30",
      },
    },
    MOCK_CONFIG as never
  );

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("AUTH_REQUIRED");
});
```

```ts
// src/tests/create-issue.test.ts
import { handleCreateIssue } from "../tools/create-issue.js";

it("formats the created issue response", async () => {
  const result = await handleCreateIssue(
    {
      issueTypeId: ISSUE_TYPE.TASK,
      fields: {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Create MCP tool",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      },
    },
    mockConfig as never
  );

  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain("# Created issue DNIEM-42");
  expect(result.content[0].text).toContain("Task");
});
```

- [ ] **Step 2: Run the tool-focused tests to verify failure**

Run: `npx vitest run src/tests/tools.test.ts src/tests/regression.test.ts src/tests/create-issue.test.ts`

Expected: FAIL because `createIssueSchema`, `handleCreateIssue`, and server registration do not exist.

- [ ] **Step 3: Implement the tool handler and register it**

```ts
// src/tools/create-issue.ts
import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  ISSUE_TYPE,
  FIELD,
  type IssueTypeId,
} from "../jira/constants.js";
import {
  buildCreateIssuePayload,
  buildCreateIssueResult,
} from "../jira/create-issue.js";
import type { Config } from "../config.js";

export const createIssueSchema = z.object({
  issueTypeId: z.enum([
    ISSUE_TYPE.EPIC,
    ISSUE_TYPE.STORY,
    ISSUE_TYPE.TASK,
    ISSUE_TYPE.IMPROVEMENT,
    ISSUE_TYPE.BUG,
    ISSUE_TYPE.BUG_CUSTOMER,
    ISSUE_TYPE.LEAKAGE,
    ISSUE_TYPE.QA,
    ISSUE_TYPE.CHANGE_REQUEST,
    ISSUE_TYPE.RISK,
    ISSUE_TYPE.OPPORTUNITY,
    ISSUE_TYPE.ISSUE,
    ISSUE_TYPE.NEW_FEATURE,
    ISSUE_TYPE.LESSON_PRACTICE,
    ISSUE_TYPE.DELIVERABLE,
    ISSUE_TYPE.COMTOR_TASK,
    ISSUE_TYPE.FEEDBACK,
    ISSUE_TYPE.DEPENDENCY,
    ISSUE_TYPE.PROJECT_TRAINING,
    ISSUE_TYPE.NC,
    ISSUE_TYPE.INCIDENT,
    ISSUE_TYPE.MA,
    ISSUE_TYPE.REVIEW_COMMENT,
    ISSUE_TYPE.REVIEW_DEFECT,
  ] as const),
  fields: z.record(z.unknown()).default({}),
});

export async function handleCreateIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = createIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueTypeId, fields } = parsed.data as {
    issueTypeId: IssueTypeId;
    fields: Record<string, unknown>;
  };

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return authErrorContent(err.code, err.message);
    }
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const payload = buildCreateIssuePayload(issueTypeId, fields);
    const created = await client.createIssue(payload);
    const summary = String(fields[FIELD.SUMMARY] ?? "");
    const result = buildCreateIssueResult(cfg.JIRA_BASE_URL, created, issueTypeId, summary);

    return {
      content: [{ type: "text", text: formatCreatedIssue(result) }],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    if (err instanceof Error) {
      return errorContent(err.message);
    }
    throw err;
  }
}

function formatCreatedIssue(issue: {
  key: string;
  url: string;
  summary: string;
  issueType: string;
}): string {
  return [
    `# Created issue ${issue.key}`,
    ``,
    `**Summary:** ${issue.summary}`,
    `**Type:** ${issue.issueType}`,
    `**URL:** ${issue.url}`,
  ].join("\\n");
}
```

```ts
// src/server.ts
import { handleCreateIssue } from "./tools/create-issue.js";

server.tool(
  "jira_create_issue",
  "Create a Jira issue for a specific issue type using required and optional fields defined in src/jira/constants.ts",
  {
    issueTypeId: z.string().describe("Jira issue type ID from src/jira/constants.ts"),
    fields: z.record(z.unknown()).describe("Jira create payload fields keyed by FIELD/CUSTOM_FIELD IDs."),
  },
  async (input) => {
    return handleCreateIssue(input, config);
  }
);
```

- [ ] **Step 4: Run the tool-focused tests again**

Run: `npx vitest run src/tests/tools.test.ts src/tests/regression.test.ts src/tests/create-issue.test.ts`

Expected: PASS for schema parsing, auth-failure regression, and response formatting.

- [ ] **Step 5: Commit the MCP tool**

```bash
git add src/tools/create-issue.ts src/server.ts src/tests/tools.test.ts src/tests/regression.test.ts src/tests/create-issue.test.ts
git commit -m "feat: add jira_create_issue MCP tool"
```

### Task 4: Document the Tool and Run Full Verification

**Files:**
- Create: `docs/tools/jira_create_issue.md`
- Modify: `README.md`

- [ ] **Step 1: Write the documentation and examples**

````md
# jira_create_issue

Create a Jira issue through the internal Jira 8 REST API.

## Input

```json
{
  "issueTypeId": "10000",
  "fields": {
    "project": { "key": "DNIEM" },
    "summary": "Create MCP tool",
    "customfield_10401": { "id": "10400" },
    "customfield_10339": [{ "id": "10300" }],
    "duedate": "2026-04-30",
    "description": "Optional details"
  }
}
```

## Validation Rules

- `issueTypeId` must exist in `src/jira/constants.ts`
- Required fields are enforced from `REQUIRED_FIELDS[issueTypeId]`
- Optional fields are allowlisted from `OPTIONAL_FIELDS[issueTypeId]`
- `issuetype` is injected automatically from `issueTypeId`

## Output

Markdown confirmation with created issue key, summary, type, and URL.
````

Also update `README.md` tool list with:

```md
- `jira_create_issue` — Create a Jira issue using issue-type-specific required and optional fields from `src/jira/constants.ts`
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: no output, exit code `0`.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`

Expected: all test files PASS, including the new create-issue coverage.

- [ ] **Step 4: Do a manual smoke review of the public contract**

Use this checklist before finalizing:

```md
- The tool name is exactly `jira_create_issue`
- `src/server.ts` imports `./tools/create-issue.js` with the `.js` extension
- Errors from invalid input or Jira/session failures return `isError: true`
- Redirects from Jira create requests are classified as `SESSION_EXPIRED`
- The doc examples only use field IDs that exist in `src/jira/constants.ts`
```

- [ ] **Step 5: Commit the docs and verification-complete state**

```bash
git add docs/tools/jira_create_issue.md README.md
git commit -m "docs: add jira_create_issue usage guide"
```

## Self-Review

- Spec coverage:
  The plan covers field metadata, validation, HTTP transport, MCP registration, docs, and verification. The only intentionally deferred scope is deep per-field option/value-shape validation beyond field presence and allowlisting.
- Placeholder scan:
  No `TODO`, `TBD`, or "implement later" markers remain in the tasks.
- Type consistency:
  The plan uses one tool name (`jira_create_issue`), one helper module (`src/jira/create-issue.ts`), and one input shape (`issueTypeId` + `fields`) throughout.

## Notes

- Keep v1 conservative: field-name allowlisting and required-field enforcement are in scope; exhaustive validation of every custom field option ID is not.
- Do not route create flow through Playwright. The auth/session boundary must stay unchanged.
- Prefer one focused helper module over stuffing validation logic into `src/tools/create-issue.ts`.
