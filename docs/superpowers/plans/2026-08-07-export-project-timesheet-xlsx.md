# Export Project Timesheet (xlsx) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `jira_export_project_timesheet` MCP tool that exports a Jira project's full Tempo timesheet (all members, arbitrary date range) to a native Tempo export file (xlsx/xls/csv) saved to the local downloads folder.

**Architecture:** A new `JiraHttpClient.exportProjectTimesheet()` method drives Tempo's undocumented two-step export flow (`POST .../worklogs/export/filter` → `GET .../worklogs/export/{filterId}`) and returns raw file bytes + response headers. A new tool handler resolves a human-readable title via `getProjects()`, calls the client method, determines the file extension from response headers (falling back to the requested format), and writes the buffer to `cfg.ATTACHMENT_WORKSPACE`.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Zod, Axios (via existing `JiraHttpClient`), Vitest, Node `fs/promises`.

**Design spec:** `docs/superpowers/specs/2026-08-07-export-project-timesheet-xlsx-design.md`

## Global Constraints

- **Output destination:** save to `cfg.ATTACHMENT_WORKSPACE` (same dir as `jira_add_attachment`/`jira_upload_attachment_content`); return the absolute file path in the tool response. No auto-attach-to-issue in this iteration.
- **No custom spreadsheet building:** use Tempo's native export bytes as-is — no new spreadsheet dependency (e.g. exceljs).
- **Endpoint shape:** two-step filter+export flow using `projectKey` (not a resolved member list), so it covers every project member automatically.
- **Format input:** `format` accepts `"xlsx" | "xls" | "csv"`, default `"xlsx"`; the value sent to Tempo and the file extension written to disk are derived independently (see extension-resolution logic in Task 2) since the true supported Tempo values are unverified.
- **Title must be double URL-encoded** when built into the export URL (`encodeURIComponent(encodeURIComponent(title))`) to match the captured Tempo UI behavior.
- **TypeScript strict, ESM only** — all imports use the `.js` extension (NodeNext resolution). No `any`, no implicit types.
- **Zod validates all tool inputs.**
- **Errors always use `McpError`** with typed codes; every tool error path returns `{ content: [...], isError: true }`.
- **Raw API response shapes live in `src/types/jira-api.ts`**; normalized/shared types live in `src/types.ts`.
- **No `WRITE_CONFIRMATION`** on this tool — it only reads Tempo data and writes a local file, same class as `jira_search_worklogs`.
- Run `npx tsc --noEmit && npx vitest run` after every task before committing.
- Per project rules, run GitNexus `impact({target: "JiraHttpClient", direction: "upstream"})` before editing `src/jira/http-client.ts`, and `impact({target: "createMcpServer", direction: "upstream"})` before editing `src/server.ts`, since both are shared symbols with many existing callers/tools. Report the blast radius before proceeding; these are additive changes (new method / new tool registration) so risk should be LOW, but confirm before editing.

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `src/jira/endpoints.ts` | Add `tempoWorklogsExportFilterUrl`, `tempoWorklogsExportUrl` builders |
| `src/types/jira-api.ts` | Add `TempoRawExportFilterResponse` (raw, unverified filter-id response shape) |
| `src/types.ts` | Add `TempoExportedTimesheetFile` (normalized binary-file-plus-headers result) |
| `src/jira/http-client.ts` | Add `exportProjectTimesheet()` method + `extractFilterId()` helper |
| `src/tests/http-client-write.test.ts` | Unit tests for the new client method (mocked axios) |
| `src/tools/export-project-timesheet.ts` | New tool: schema + handler, writes file to disk |
| `src/tests/export-project-timesheet.test.ts` | Unit tests for the new tool (mocked `JiraHttpClient` + `node:fs/promises`) |
| `src/server.ts` | Register `jira_export_project_timesheet` |
| `docs/tools/jira_export_project_timesheet.md` | New tool doc |
| `docs/superpowers/specs/tempo-timesheet-workflow.md` | Add tool-map row + one new use case |

---

### Task 1: HTTP client — Tempo export filter+export flow

**Files:**
- Modify: `src/jira/endpoints.ts:86-89` (insert new builders)
- Modify: `src/types/jira-api.ts` (append new interface at end of file, after line 172)
- Modify: `src/types.ts:406-416` (insert new interface after `TempoWorklogListItem`)
- Modify: `src/jira/http-client.ts:1-61` (imports), `:607-613` (insert new method after `deleteWorklog`), `:862-869` (insert new helper after `isLoginPage`)
- Test: `src/tests/http-client-write.test.ts` (append tests before the final `});`)

**Interfaces:**
- Produces: `tempoWorklogsExportFilterUrl(baseUrl: string): string`, `tempoWorklogsExportUrl(baseUrl: string, filterId: string): string` in `src/jira/endpoints.ts`.
- Produces: `TempoRawExportFilterResponse { filterId?: string; id?: string; uuid?: string }` in `src/types/jira-api.ts`.
- Produces: `TempoExportedTimesheetFile { buffer: Buffer; contentType?: string; contentDisposition?: string }` in `src/types.ts`.
- Produces: `JiraHttpClient.exportProjectTimesheet(input: { dateFrom: string; dateTo: string; projectKey: string; title: string; format: string }): Promise<TempoExportedTimesheetFile>` — consumed by Task 2's tool handler.

- [ ] **Step 1: Write the failing tests**

Open `src/tests/http-client-write.test.ts` and insert the following three tests immediately before the final `});` that closes the `describe("JiraHttpClient write helpers", ...)` block (i.e. right after the `"returns projects, components, and priorities"` test, which currently ends the file):

```typescript
  it("exports a project timesheet via the two-step Tempo filter+export flow", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: { filterId: "8cbcd13f059a4ad99085b1f9353b70fc" },
    });
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: new TextEncoder().encode("binary-xlsx-bytes").buffer,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="Project timesheet.xlsx"',
      },
    });

    const result = await client.exportProjectTimesheet({
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
      projectKey: "ME",
      title: "Project: Microcopy E-learning System (ME)",
      format: "xlsx",
    });

    expect(mockedInstance.post).toHaveBeenCalledWith(
      `${BASE_URL}/rest/tempo-timesheets/4/worklogs/export/filter`,
      { from: "2026-04-20", to: "2026-04-26", projectKey: ["ME"] }
    );
    expect(mockedInstance.get).toHaveBeenCalledWith(
      `${BASE_URL}/rest/tempo-timesheets/4/worklogs/export/8cbcd13f059a4ad99085b1f9353b70fc` +
        `?format=xlsx&title=Project%253A%2520Microcopy%2520E-learning%2520System%2520(ME)`,
      { responseType: "arraybuffer", headers: { Accept: "*/*" } }
    );
    expect(result.buffer.toString()).toBe("binary-xlsx-bytes");
    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(result.contentDisposition).toBe('attachment; filename="Project timesheet.xlsx"');
  });

  it("falls back to a raw string filterId when the filter response has no known field", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: "8cbcd13f059a4ad99085b1f9353b70fc",
    });
    vi.mocked(mockedInstance.get).mockResolvedValue({
      status: 200,
      data: new TextEncoder().encode("csv,bytes").buffer,
      headers: { "content-type": "text/csv" },
    });

    const result = await client.exportProjectTimesheet({
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
      projectKey: "ME",
      title: "Project: ME",
      format: "csv",
    });

    expect(mockedInstance.get).toHaveBeenCalledWith(
      `${BASE_URL}/rest/tempo-timesheets/4/worklogs/export/8cbcd13f059a4ad99085b1f9353b70fc` +
        `?format=csv&title=Project%253A%2520ME`,
      { responseType: "arraybuffer", headers: { Accept: "*/*" } }
    );
    expect(result.contentType).toBe("text/csv");
  });

  it("throws JIRA_RESPONSE_ERROR when the filter response has no recognizable filter id", async () => {
    const client = new JiraHttpClient(BASE_URL, cookies);
    const mockedInstance = vi.mocked(axios.create).mock.results[0]?.value;
    vi.mocked(mockedInstance.post).mockResolvedValue({
      status: 200,
      data: { unexpected: "shape" },
    });

    await expect(
      client.exportProjectTimesheet({
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
        projectKey: "ME",
        title: "Project: ME",
        format: "xlsx",
      })
    ).rejects.toMatchObject({ code: "JIRA_RESPONSE_ERROR" });
    expect(mockedInstance.get).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use && npx vitest run src/tests/http-client-write.test.ts`
Expected: FAIL — `client.exportProjectTimesheet is not a function` (method doesn't exist yet).

- [ ] **Step 3: Add endpoint builders**

In `src/jira/endpoints.ts`, find:

```typescript
export function tempoTimesheetApprovalLogUrl(baseUrl: string, teamId: number, periodStartDate: string): string {
  return `${baseUrl}${TEMPO_API_BASE}/timesheet-approval/log?teamId=${encodeURIComponent(teamId)}&periodStartDate=${encodeURIComponent(periodStartDate)}`;
}

export function tempoTeamSearchUrl(baseUrl: string): string {
```

Replace with:

```typescript
export function tempoTimesheetApprovalLogUrl(baseUrl: string, teamId: number, periodStartDate: string): string {
  return `${baseUrl}${TEMPO_API_BASE}/timesheet-approval/log?teamId=${encodeURIComponent(teamId)}&periodStartDate=${encodeURIComponent(periodStartDate)}`;
}

/**
 * URL for step 1 of the Tempo timesheet export flow — registers a search
 * filter and returns a filter id used by `tempoWorklogsExportUrl`.
 */
export function tempoWorklogsExportFilterUrl(baseUrl: string): string {
  return `${baseUrl}${TEMPO_API_BASE}/worklogs/export/filter`;
}

/**
 * URL for step 2 of the Tempo timesheet export flow — streams back the
 * binary export file for a previously-registered filter id.
 */
export function tempoWorklogsExportUrl(baseUrl: string, filterId: string): string {
  return `${baseUrl}${TEMPO_API_BASE}/worklogs/export/${encodeURIComponent(filterId)}`;
}

export function tempoTeamSearchUrl(baseUrl: string): string {
```

- [ ] **Step 4: Add the raw response type**

In `src/types/jira-api.ts`, append at the end of the file (after the `TempoRawApprovalLogResponse` type on line 172):

```typescript

/**
 * Response shape from POST /worklogs/export/filter — unverified against a
 * live instance. The client probes filterId/id/uuid/raw-string in that
 * order (see `extractFilterId` in http-client.ts).
 */
export interface TempoRawExportFilterResponse {
  filterId?: string;
  id?: string;
  uuid?: string;
}
```

- [ ] **Step 5: Add the normalized result type**

In `src/types.ts`, find:

```typescript
export interface TempoWorklogListItem {
  tempoWorklogId: number;
  issueKey: string;
  issueSummary: string | null;
  timeSpent: string;
  timeSpentSeconds: number;
  startDate: string;
  comment: string | null;
  process: string | null;
  typeOfWork: string | null;
}
```

Replace with:

```typescript
export interface TempoWorklogListItem {
  tempoWorklogId: number;
  issueKey: string;
  issueSummary: string | null;
  timeSpent: string;
  timeSpentSeconds: number;
  startDate: string;
  comment: string | null;
  process: string | null;
  typeOfWork: string | null;
}

/**
 * Binary export file returned by `exportProjectTimesheet`, plus the HTTP
 * response headers needed to resolve a filename/extension.
 */
export interface TempoExportedTimesheetFile {
  buffer: Buffer;
  contentType?: string;
  contentDisposition?: string;
}
```

- [ ] **Step 6: Implement the client method**

In `src/jira/http-client.ts`, update the endpoint import block. Find:

```typescript
  tempoCreateWorklogUrl,
  tempoWorklogUrl,
  tempoSearchWorklogsUrl,
  tempoTimesheetApprovalUrl,
  tempoTimesheetApprovalLogUrl,
  tempoTeamSearchUrl,
```

Replace with:

```typescript
  tempoCreateWorklogUrl,
  tempoWorklogUrl,
  tempoSearchWorklogsUrl,
  tempoTimesheetApprovalUrl,
  tempoTimesheetApprovalLogUrl,
  tempoTeamSearchUrl,
  tempoWorklogsExportFilterUrl,
  tempoWorklogsExportUrl,
```

Then update the normalized-type import. Find:

```typescript
  TempoTimesheetApproval,
  TempoTeam,
  TempoApprovalLogEntry,
} from "../types.js";
import type { TempoRawTimesheetApprovalResponse, TempoRawWorklog, TempoRawTeam, TempoRawApprovalLogResponse } from "../types/jira-api.js";
```

Replace with:

```typescript
  TempoTimesheetApproval,
  TempoTeam,
  TempoApprovalLogEntry,
  TempoExportedTimesheetFile,
} from "../types.js";
import type {
  TempoRawTimesheetApprovalResponse,
  TempoRawWorklog,
  TempoRawTeam,
  TempoRawApprovalLogResponse,
  TempoRawExportFilterResponse,
} from "../types/jira-api.js";
```

Now add the method itself. Find:

```typescript
  async deleteWorklog(worklogId: string): Promise<void> {
    const url = tempoWorklogUrl(this.baseUrl, worklogId);
    const res = await this.http.delete(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  // ---------------------------------------------------------------------------
  // Attachment download
  // ---------------------------------------------------------------------------
```

Replace with:

```typescript
  async deleteWorklog(worklogId: string): Promise<void> {
    const url = tempoWorklogUrl(this.baseUrl, worklogId);
    const res = await this.http.delete(url);

    this.checkForAuthFailure(res.status, url, res.data);
    this.assertOk(res.status, url, res.data);
  }

  /**
   * Exports a project's full Tempo timesheet (all members) for a date range,
   * using Tempo's own two-step Server/DC export flow:
   *   1. POST .../worklogs/export/filter → registers a filter, returns a filter id.
   *   2. GET .../worklogs/export/{filterId}?format=&title= → streams the file.
   * The `title` is double URL-encoded to match the behavior captured from
   * the Tempo Timesheets UI's own "Export" button.
   */
  async exportProjectTimesheet(input: {
    dateFrom: string;
    dateTo: string;
    projectKey: string;
    title: string;
    format: string;
  }): Promise<TempoExportedTimesheetFile> {
    const filterUrl = tempoWorklogsExportFilterUrl(this.baseUrl);
    const filterRes = await this.http.post(filterUrl, {
      from: input.dateFrom,
      to: input.dateTo,
      projectKey: [input.projectKey],
    });

    this.checkForAuthFailure(filterRes.status, filterUrl, filterRes.data);
    this.assertOk(filterRes.status, filterUrl, filterRes.data);

    const filterId = extractFilterId(filterRes.data);
    if (!filterId) {
      throw jiraResponseError(
        "Unexpected Tempo export filter response shape — no filterId/id/uuid field found",
        filterRes.data
      );
    }

    const exportUrl =
      `${tempoWorklogsExportUrl(this.baseUrl, filterId)}` +
      `?format=${encodeURIComponent(input.format)}` +
      `&title=${encodeURIComponent(encodeURIComponent(input.title))}`;

    const exportRes = await this.http.get(exportUrl, {
      responseType: "arraybuffer",
      headers: { Accept: "*/*" },
    });

    this.checkForAuthFailure(exportRes.status, exportUrl, "");
    this.assertOk(exportRes.status, exportUrl, "");

    return {
      buffer: Buffer.from(exportRes.data as ArrayBuffer),
      contentType: exportRes.headers["content-type"],
      contentDisposition: exportRes.headers["content-disposition"],
    };
  }

  // ---------------------------------------------------------------------------
  // Attachment download
  // ---------------------------------------------------------------------------
```

Finally, add the `extractFilterId` helper. Find:

```typescript
function isLoginPage(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.startsWith("<!") &&
    (lower.includes("log in") || lower.includes("login") || lower.includes("sso"))
  );
}
```

Replace with:

```typescript
function isLoginPage(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.startsWith("<!") &&
    (lower.includes("log in") || lower.includes("login") || lower.includes("sso"))
  );
}

/**
 * Extracts a filter id from Tempo's POST /worklogs/export/filter response.
 * The field name is unverified against a live instance, so this probes a
 * raw string body, then `filterId`, `id`, and `uuid` in that order.
 */
function extractFilterId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  if (raw && typeof raw === "object") {
    const obj = raw as TempoRawExportFilterResponse;
    if (typeof obj.filterId === "string" && obj.filterId.length > 0) return obj.filterId;
    if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
    if (typeof obj.uuid === "string" && obj.uuid.length > 0) return obj.uuid;
  }
  return null;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `nvm use && npx tsc --noEmit && npx vitest run src/tests/http-client-write.test.ts`
Expected: PASS — all tests in the file green, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/jira/endpoints.ts src/types/jira-api.ts src/types.ts src/jira/http-client.ts src/tests/http-client-write.test.ts
git commit -m "feat: add Tempo project timesheet export client method"
```

---

### Task 2: Tool — `jira_export_project_timesheet`

**Files:**
- Create: `src/tools/export-project-timesheet.ts`
- Modify: `src/server.ts:50` (import), `:657-668` (registration, inserted after `jira_search_worklogs`)
- Test: `src/tests/export-project-timesheet.test.ts`

**Interfaces:**
- Consumes: `JiraHttpClient.exportProjectTimesheet(input): Promise<TempoExportedTimesheetFile>` and `JiraHttpClient.getProjects(): Promise<JiraProject[]>` (Task 1); `loadAndValidateSession(sessionFile, baseUrl, validatePath)` from `src/auth/session-manager.ts`; `navigationHint(...suggestions)` from `src/utils.ts`; `isMcpError(err)` from `src/errors.ts`; `Config` type from `src/config.ts` (has `ATTACHMENT_WORKSPACE: string`, `JIRA_SESSION_FILE`, `JIRA_BASE_URL`, `JIRA_VALIDATE_PATH`).
- Produces: `exportProjectTimesheetSchema` (Zod object schema), `handleExportProjectTimesheet(rawInput: unknown, cfg: Config): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>`. Registered as MCP tool name `jira_export_project_timesheet`.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/export-project-timesheet.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportProjectTimesheetSchema,
  handleExportProjectTimesheet,
} from "../tools/export-project-timesheet.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { McpError } from "../errors.js";
import { mkdir, writeFile } from "node:fs/promises";

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself" as const,
  ATTACHMENT_WORKSPACE: "/tmp/jira-downloads",
  LOG_LEVEL: "info" as const,
  PLAYWRIGHT_HEADLESS: false as const,
  PLAYWRIGHT_BROWSER: "chromium" as const,
};

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => ({
  JiraHttpClient: vi.fn().mockImplementation(() => ({
    exportProjectTimesheet: vi.fn(),
    getProjects: vi.fn(),
  })),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("exportProjectTimesheetSchema", () => {
  it("accepts valid input and defaults format to xlsx", () => {
    const result = exportProjectTimesheetSchema.safeParse({
      projectKey: "ME",
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe("xlsx");
  });

  it("rejects empty projectKey", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "",
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
      }).success
    ).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "ME",
        dateFrom: "20/04/2026",
        dateTo: "2026-04-26",
      }).success
    ).toBe(false);
  });

  it("rejects an unsupported format value", () => {
    expect(
      exportProjectTimesheetSchema.safeParse({
        projectKey: "ME",
        dateFrom: "2026-04-20",
        dateTo: "2026-04-26",
        format: "pdf",
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleExportProjectTimesheet", () => {
  let mockExport: ReturnType<typeof vi.fn>;
  let mockGetProjects: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExport = vi.fn();
    mockGetProjects = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      exportProjectTimesheet: mockExport,
      getProjects: mockGetProjects,
    }) as any);
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
  });

  it("writes the exported file to ATTACHMENT_WORKSPACE and reports its path", async () => {
    mockGetProjects.mockResolvedValue([
      {
        id: "10000",
        key: "ME",
        name: "Microcopy E-learning System",
        url: "https://jira.example.com/projects/ME",
      },
    ]);
    mockExport.mockResolvedValue({
      buffer: Buffer.from("xlsx-bytes"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentDisposition: undefined,
    });

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(mockExport).toHaveBeenCalledWith({
      dateFrom: "2026-04-20",
      dateTo: "2026-04-26",
      projectKey: "ME",
      title: "Project: Microcopy E-learning System (ME)",
      format: "xlsx",
    });
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith("/tmp/jira-downloads", { recursive: true });
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("timesheet_ME_2026-04-20_to_2026-04-26_"),
      expect.any(Buffer)
    );
    const text = result.content[0].text;
    expect(text).toContain("ME");
    expect(text).toContain("2026-04-20");
    expect(text).toContain(".xlsx");
  });

  it("falls back to a generic title when the project lookup fails", async () => {
    mockGetProjects.mockRejectedValue(new Error("network error"));
    mockExport.mockResolvedValue({ buffer: Buffer.from("bytes"), contentType: "text/csv" });

    const result = await handleExportProjectTimesheet(
      { projectKey: "ZZZ", dateFrom: "2026-04-20", dateTo: "2026-04-26", format: "csv" },
      mockConfig
    );

    expect(result.isError).toBeUndefined();
    expect(mockExport).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Project: ZZZ" })
    );
  });

  it("surfaces filter-id-parse failures with the raw payload visible", async () => {
    mockGetProjects.mockResolvedValue([]);
    mockExport.mockRejectedValue(
      new McpError("JIRA_RESPONSE_ERROR", "Unexpected Tempo export filter response shape", {
        unexpected: "shape",
      })
    );

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("JIRA_RESPONSE_ERROR");
  });

  it("surfaces auth errors with isError true", async () => {
    vi.mocked(loadAndValidateSession).mockRejectedValue(
      new McpError("SESSION_EXPIRED", "Auth failed")
    );

    const result = await handleExportProjectTimesheet(
      { projectKey: "ME", dateFrom: "2026-04-20", dateTo: "2026-04-26" },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SESSION_EXPIRED");
  });

  it("returns validation error for bad input", async () => {
    const result = await handleExportProjectTimesheet(
      { projectKey: "", dateFrom: "bad", dateTo: "bad" },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use && npx vitest run src/tests/export-project-timesheet.test.ts`
Expected: FAIL — `Cannot find module '../tools/export-project-timesheet.js'`.

- [ ] **Step 3: Implement the tool**

Create `src/tools/export-project-timesheet.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const exportProjectTimesheetSchema = z.object({
  projectKey: z
    .string()
    .min(1, "projectKey is required")
    .describe("Jira project key, e.g. PROJ"),
  dateFrom: z
    .string()
    .regex(DATE_REGEX, "dateFrom must be in yyyy-MM-dd format")
    .describe("Start of date range (yyyy-MM-dd), e.g. 2026-04-01"),
  dateTo: z
    .string()
    .regex(DATE_REGEX, "dateTo must be in yyyy-MM-dd format")
    .describe("End of date range inclusive (yyyy-MM-dd), e.g. 2026-04-30"),
  format: z
    .enum(["xlsx", "xls", "csv"])
    .optional()
    .default("xlsx")
    .describe("Requested export format — actual file extension is confirmed from the server response"),
});

export type ExportProjectTimesheetInput = z.infer<typeof exportProjectTimesheetSchema>;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleExportProjectTimesheet(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const parsed = exportProjectTimesheetSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { projectKey, dateFrom, dateTo, format } = parsed.data;

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const title = await resolveTitle(client, projectKey);
    const file = await client.exportProjectTimesheet({ dateFrom, dateTo, projectKey, title, format });

    const ext = resolveExtension(file.contentDisposition, file.contentType, format);
    const filename = `timesheet_${projectKey}_${dateFrom}_to_${dateTo}_${Date.now()}.${ext}`;
    await mkdir(cfg.ATTACHMENT_WORKSPACE, { recursive: true });
    const fullPath = join(cfg.ATTACHMENT_WORKSPACE, filename);
    await writeFile(fullPath, file.buffer);

    const text = formatResult({ projectKey, dateFrom, dateTo, ext, fullPath, size: file.buffer.length });
    return { content: [{ type: "text" as const, text }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Never fails the export just because a pretty project title couldn't be resolved. */
async function resolveTitle(client: JiraHttpClient, projectKey: string): Promise<string> {
  try {
    const projects = await client.getProjects();
    const project = projects.find((p) => p.key === projectKey);
    if (project) return `Project: ${project.name} (${project.key})`;
  } catch {
    // fall through to generic title
  }
  return `Project: ${projectKey}`;
}

function resolveExtension(
  contentDisposition: string | undefined,
  contentType: string | undefined,
  requestedFormat: string
): string {
  if (contentDisposition) {
    const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
    if (match) {
      const dotIndex = match[1].lastIndexOf(".");
      if (dotIndex !== -1 && dotIndex < match[1].length - 1) {
        return match[1].slice(dotIndex + 1).toLowerCase();
      }
    }
  }
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase();
    if (EXTENSION_BY_CONTENT_TYPE[base]) return EXTENSION_BY_CONTENT_TYPE[base];
  }
  return requestedFormat;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatResult(input: {
  projectKey: string;
  dateFrom: string;
  dateTo: string;
  ext: string;
  fullPath: string;
  size: number;
}): string {
  const lines = [
    `# 📊 Project Timesheet Exported`,
    "",
    `**Project:** ${input.projectKey}`,
    `**Period:** ${input.dateFrom} → ${input.dateTo}`,
    `**Format:** ${input.ext}`,
    `**File:** ${input.fullPath}`,
    `**Size:** ${fmtSize(input.size)}`,
  ];
  lines.push(
    navigationHint(
      `\`jira_upload_attachment_content({issueKey: "<key>", filename: "${input.fullPath.split("/").pop()}", content: "<base64>", encoding: "base64"})\` to attach this file to a Jira issue`
    )
  );
  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `[${code}] ${message}\n\nRun: npm run jira-auth-login` }],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `nvm use && npx tsc --noEmit && npx vitest run src/tests/export-project-timesheet.test.ts`
Expected: PASS — all tests green, no TypeScript errors.

- [ ] **Step 5: Register the tool in the server**

In `src/server.ts`, find the import block:

```typescript
import { handleSearchWorklogs } from "./tools/search-worklogs.js";
import { handleActOnTimesheetApproval } from "./tools/act-on-timesheet-approval.js";
```

Replace with:

```typescript
import { handleSearchWorklogs } from "./tools/search-worklogs.js";
import { handleExportProjectTimesheet } from "./tools/export-project-timesheet.js";
import { handleActOnTimesheetApproval } from "./tools/act-on-timesheet-approval.js";
```

Then find the `jira_search_worklogs` tool registration:

```typescript
  server.tool(
    "jira_search_worklogs",
    "Search Tempo worklogs for one or more workers over a date range. Returns worklog entries with time spent, issue, process, and comment details.",
    {
      dateFrom: z.string().describe("Start of date range in yyyy-MM-dd format (e.g., 2026-04-20)"),
      dateTo: z.string().describe("End of date range inclusive in yyyy-MM-dd format (e.g., 2026-04-26)"),
      workers: z.array(z.string()).min(1).describe("List of Jira usernames/keys to fetch worklogs for, e.g. [\"ducnpp@runsystem.net\"]"),
    },
    async (input) => {
      return handleSearchWorklogs(input, config);
    }
  );

  server.tool(
    "jira_act_on_timesheet_approval",
```

Replace with:

```typescript
  server.tool(
    "jira_search_worklogs",
    "Search Tempo worklogs for one or more workers over a date range. Returns worklog entries with time spent, issue, process, and comment details.",
    {
      dateFrom: z.string().describe("Start of date range in yyyy-MM-dd format (e.g., 2026-04-20)"),
      dateTo: z.string().describe("End of date range inclusive in yyyy-MM-dd format (e.g., 2026-04-26)"),
      workers: z.array(z.string()).min(1).describe("List of Jira usernames/keys to fetch worklogs for, e.g. [\"ducnpp@runsystem.net\"]"),
    },
    async (input) => {
      return handleSearchWorklogs(input, config);
    }
  );

  server.tool(
    "jira_export_project_timesheet",
    "Export a Jira project's full Tempo timesheet (worklogs from all members) for a date range into a native Tempo export file (xlsx/xls/csv), saved to the local downloads folder. Returns the absolute file path.",
    {
      projectKey: z.string().describe("Jira project key, e.g. PROJ"),
      dateFrom: z.string().describe("Start of date range in yyyy-MM-dd format (e.g., 2026-04-01)"),
      dateTo: z.string().describe("End of date range inclusive in yyyy-MM-dd format (e.g., 2026-04-30)"),
      format: z.enum(["xlsx", "xls", "csv"]).optional().describe("Requested export format (default xlsx)"),
    },
    async (input) => {
      return handleExportProjectTimesheet(input, config);
    }
  );

  server.tool(
    "jira_act_on_timesheet_approval",
```

- [ ] **Step 6: Run the full test suite**

Run: `nvm use && npx tsc --noEmit && npx vitest run`
Expected: PASS — full suite green, no TypeScript errors, no regressions in other tool registrations.

- [ ] **Step 7: Commit**

```bash
git add src/tools/export-project-timesheet.ts src/tests/export-project-timesheet.test.ts src/server.ts
git commit -m "feat: add jira_export_project_timesheet MCP tool"
```

---

### Task 3: Documentation

**Files:**
- Create: `docs/tools/jira_export_project_timesheet.md`
- Modify: `docs/superpowers/specs/tempo-timesheet-workflow.md:9-16` (Tool Map table), `:126-133` (add Use Case 9 before "Status Reference")

**Interfaces:**
- Consumes: final schema/behavior from Task 2 (`projectKey`, `dateFrom`, `dateTo`, `format` fields; output = markdown with project/period/format/path/size).

- [ ] **Step 1: Write the tool doc**

Create `docs/tools/jira_export_project_timesheet.md`:

```markdown
# jira_export_project_timesheet

Export a Jira project's full Tempo timesheet (all members) for a date range to a native Tempo export file.

## Purpose

This tool drives Tempo's own two-step Server/DC export flow (the same one used by the Tempo Timesheets UI's "Export" button) to produce an `.xlsx`/`.xls`/`.csv` file covering **every member's** worklogs on a project, rather than a hand-picked list of workers. Unlike `jira_search_worklogs` (which requires an explicit `workers` list), this tool filters by `projectKey` so it automatically covers all contributors.

The exported file is Tempo's own native output — no custom spreadsheet is built. The file is saved to the local downloads folder and the absolute path is returned.

## Input Schema

- `projectKey` (string): Jira project key, e.g. `"PROJ"`.
- `dateFrom` (string): Start of date range in `yyyy-MM-dd` format (e.g., `"2026-04-01"`).
- `dateTo` (string): End of date range inclusive in `yyyy-MM-dd` format (e.g., `"2026-04-30"`).
- `format` (optional, `"xlsx" | "xls" | "csv"`, default `"xlsx"`): Requested export format. The actual file extension written to disk is confirmed from the server's response headers, since Tempo's supported format values are not officially documented.

## Output

Returns Markdown with:
- Project key, date range, resolved format/extension
- Absolute file path on disk
- Human-readable file size

## Examples

### Export a Full Month for One Project

**Input:**
```json
{
  "projectKey": "ME",
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-30"
}
```

### Export as CSV

**Input:**
```json
{
  "projectKey": "ME",
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-30",
  "format": "csv"
}
```

## Known Limitations

- The exact Tempo `format` values accepted by the live instance are unverified — the tool trusts the server's response headers to determine the real file extension, so the saved file is never mislabeled even if the requested format isn't honored exactly.
- This tool does not attach the file to a Jira issue. Chain it with `jira_upload_attachment_content` (base64-encode the file content) if you need it on an issue.

## See Also

- `jira_search_worklogs` — fetch worklogs for specific named workers instead of a whole project
- `jira_get_timesheet_approvals` — check timesheet approval status for a Tempo team
- `jira_upload_attachment_content` — attach the exported file to a Jira issue afterward
```

- [ ] **Step 2: Update the Tempo workflow doc's Tool Map**

In `docs/superpowers/specs/tempo-timesheet-workflow.md`, find:

```markdown
| `jira_search_worklogs` | `POST /rest/tempo-timesheets/4/worklogs/search` | Actual worklog entries for specific people |
| `jira_act_on_timesheet_approval` | `POST /rest/tempo-timesheets/4/timesheet-approval` | Approve, reject, or reopen a member's timesheet |
```

Replace with:

```markdown
| `jira_search_worklogs` | `POST /rest/tempo-timesheets/4/worklogs/search` | Actual worklog entries for specific people |
| `jira_export_project_timesheet` | `POST /worklogs/export/filter` + `GET /worklogs/export/{id}` | Export a whole project's timesheet (all members) to xlsx/xls/csv |
| `jira_act_on_timesheet_approval` | `POST /rest/tempo-timesheets/4/timesheet-approval` | Approve, reject, or reopen a member's timesheet |
```

- [ ] **Step 3: Add a new use case**

In `docs/superpowers/specs/tempo-timesheet-workflow.md`, find:

```markdown
### Use Case 8 — Cross-Team Worklog Report

> **"Tổng hợp số giờ làm của 3 người: ducnpp, quocpa, lapdq trong tuần 2026-04-20 đến 2026-04-26."**

Expected flow:
1. `jira_search_worklogs({ dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["ducnpp@runsystem.net", "quocpa@runsystem.net", "lapdq@runsystem.net"] })`

---

## 🏗️ Status Reference
```

Replace with:

```markdown
### Use Case 8 — Cross-Team Worklog Report

> **"Tổng hợp số giờ làm của 3 người: ducnpp, quocpa, lapdq trong tuần 2026-04-20 đến 2026-04-26."**

Expected flow:
1. `jira_search_worklogs({ dateFrom: "2026-04-20", dateTo: "2026-04-26", workers: ["ducnpp@runsystem.net", "quocpa@runsystem.net", "lapdq@runsystem.net"] })`

---

### Use Case 9 — Export Full Project Timesheet

> **"Xuất timesheet cả tháng 4 của dự án ME ra file Excel."**

Expected flow:
1. `jira_export_project_timesheet({ projectKey: "ME", dateFrom: "2026-04-01", dateTo: "2026-04-30" })` → saves an `.xlsx` file locally covering every project member and returns the file path.

---

## 🏗️ Status Reference
```

- [ ] **Step 4: Commit**

```bash
git add docs/tools/jira_export_project_timesheet.md docs/superpowers/specs/tempo-timesheet-workflow.md
git commit -m "docs: add jira_export_project_timesheet tool doc and workflow use case"
```

---

## Post-Implementation: Live Verification (flag to user, not blocking)

These are the three explicitly unverified assumptions from the design spec — verify against a real Jira 8 instance after implementation, before relying on this tool in production:

1. **Filter-id response field name** — call `jira_export_project_timesheet` once against a real project and inspect whether `extractFilterId` picked the field correctly (it logs no failure only if one of `filterId`/`id`/`uuid`/raw-string matched).
2. **`format` value for true Excel** — confirm whether `format=xlsx` returns a real `.xlsx` file, or whether Tempo only honors `format=xls` (legacy) / `format=csv`. The extension-resolution logic in `resolveExtension()` protects against mislabeling regardless.
3. **Double-encoded `title`** — confirm the export succeeds; if Tempo rejects the double-encoded title, change `exportProjectTimesheet()` in `http-client.ts` to single-encode instead (`encodeURIComponent(input.title)` without the nested call) and update the corresponding test.
