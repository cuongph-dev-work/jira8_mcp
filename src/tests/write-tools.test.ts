import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPONENT,
  CUSTOM_FIELD,
  FIELD,
  ISSUE_TYPE,
} from "../jira/constants.js";
import {
  buildCreateMeta,
  getKnownFieldOptions,
} from "../jira/create-meta.js";
import { handleAddComment } from "../tools/add-comment.js";
import { handleAddAttachment } from "../tools/add-attachment.js";
import { handleAssignIssue } from "../tools/assign-issue.js";
import { handleDeleteComment } from "../tools/delete-comment.js";
import { handleDeleteWorklog } from "../tools/delete-worklog.js";
import { handleFindUser } from "../tools/find-user.js";
import { handleGetComponents } from "../tools/get-components.js";
import { handleGetCreateMeta } from "../tools/get-create-meta.js";
import { handleGetEditMeta } from "../tools/get-edit-meta.js";
import { handleGetMyWorklogs } from "../tools/get-my-worklogs.js";
import { handleGetIssueLinks } from "../tools/get-issue-links.js";
import { handleGetSubtasks } from "../tools/get-subtasks.js";
import { handleGetPriorities } from "../tools/get-priorities.js";
import { handleGetProjects } from "../tools/get-projects.js";
import { handleGetTransitions } from "../tools/get-transitions.js";
import { handleLinkIssues } from "../tools/link-issues.js";
import { handleTransitionIssue } from "../tools/transition-issue.js";
import { handleBulkLinkIssues } from "../tools/bulk-link-issues.js";
import { handleBulkTransitionIssues } from "../tools/bulk-transition-issues.js";
import { handleBulkUpdateIssueFields } from "../tools/bulk-update-issue-fields.js";
import { handleCloneIssue } from "../tools/clone-issue.js";
import { handleCreateSubtask } from "../tools/create-subtask.js";
import { handleGetAuditContext } from "../tools/get-audit-context.js";
import { handlePreviewCreateIssue } from "../tools/preview-create-issue.js";
import { handleUpdateComment } from "../tools/update-comment.js";
import { handleUpdateIssueFields } from "../tools/update-issue-fields.js";
import { handleUpdateWorklog } from "../tools/update-worklog.js";
import { handleValidateIssueUpdate } from "../tools/validate-issue-update.js";
import { handleUploadAttachmentContent } from "../tools/upload-attachment-content.js";
import { handleAddComments } from "../tools/add-comments.js";
import {
  buildUpdateIssuePayload,
  UPDATEABLE_FIELDS,
} from "../jira/update-issue.js";
import {
  buildMinimalAdfDocument,
  isAdfDocument,
  normalizeAdfValue,
} from "../jira/adf.js";
import { normalizeJiraBody } from "../jira/body-normalizer.js";
import { markdownToAdf } from "../jira/markdown-to-adf.js";
import * as sessionManager from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";

vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

describe("ADF helpers", () => {
  it("converts a string to a minimal ADF document", () => {
    expect(normalizeAdfValue("Hello Jira")).toEqual(buildMinimalAdfDocument("Hello Jira"));
  });

  it("keeps a valid ADF document unchanged", () => {
    const adf = buildMinimalAdfDocument("Already structured");
    expect(normalizeAdfValue(adf)).toEqual(adf);
  });

  it("rejects invalid ADF input", () => {
    expect(() => normalizeAdfValue(123)).toThrow(/must be a string or a valid ADF document/i);
  });
});

describe("markdownToAdf converter", () => {
  it("converts heading level 1", () => {
    const doc = markdownToAdf("# Hello");
    expect(doc.type).toBe("doc");
    expect(doc.version).toBe(1);
    const heading = doc.content[0];
    expect(heading?.type).toBe("heading");
    if (heading?.type === "heading") {
      expect(heading.attrs.level).toBe(1);
      expect(heading.content[0]?.text).toBe("Hello");
    }
  });

  it("converts heading level 2 and 3", () => {
    const doc = markdownToAdf("## Section\n\n### Sub");
    const [h2, h3] = doc.content;
    expect(h2?.type).toBe("heading");
    expect(h3?.type).toBe("heading");
    if (h2?.type === "heading") expect(h2.attrs.level).toBe(2);
    if (h3?.type === "heading") expect(h3.attrs.level).toBe(3);
  });

  it("converts plain paragraph", () => {
    const doc = markdownToAdf("Hello world");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      expect(para.content[0]?.text).toBe("Hello world");
    }
  });

  it("converts bullet list", () => {
    const doc = markdownToAdf("- Alpha\n- Beta");
    const list = doc.content[0];
    expect(list?.type).toBe("bulletList");
    if (list?.type === "bulletList") {
      expect(list.content).toHaveLength(2);
      const item0 = list.content[0];
      if (item0?.type === "listItem") {
        const para = item0.content[0];
        expect(para?.type).toBe("paragraph");
        if (para?.type === "paragraph") expect(para.content[0]?.text).toBe("Alpha");
      }
    }
  });

  it("converts ordered list", () => {
    const doc = markdownToAdf("1. First\n2. Second");
    const list = doc.content[0];
    expect(list?.type).toBe("orderedList");
    if (list?.type === "orderedList") {
      expect(list.content).toHaveLength(2);
    }
  });

  it("converts fenced code block", () => {
    const doc = markdownToAdf("```ts\nconst x = 1;\n```");
    const block = doc.content[0];
    expect(block?.type).toBe("codeBlock");
    if (block?.type === "codeBlock") {
      expect(block.attrs?.language).toBe("ts");
      expect(block.content[0]?.text).toBe("const x = 1;");
    }
  });

  it("converts inline code mark", () => {
    const doc = markdownToAdf("Use `npm install` to install.");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      const codeNode = para.content.find((n) => n.marks?.some((m) => m.type === "code"));
      expect(codeNode?.text).toBe("npm install");
    }
  });

  it("converts blockquote", () => {
    const doc = markdownToAdf("> Important note");
    const bq = doc.content[0];
    expect(bq?.type).toBe("blockquote");
    if (bq?.type === "blockquote") {
      const para = bq.content[0];
      expect(para.content[0]?.text).toBe("Important note");
    }
  });

  it("converts link with text", () => {
    const doc = markdownToAdf("See [Jira](https://jira.example.com)");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      const linkNode = para.content.find((n) =>
        n.marks?.some((m) => m.type === "link")
      );
      expect(linkNode?.text).toBe("Jira");
      const linkMark = linkNode?.marks?.find((m) => m.type === "link");
      expect(linkMark?.attrs?.href).toBe("https://jira.example.com");
    }
  });

  it("converts bold text", () => {
    const doc = markdownToAdf("**critical**");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      expect(para.content[0]?.marks?.some((m) => m.type === "strong")).toBe(true);
    }
  });

  it("converts italic text", () => {
    const doc = markdownToAdf("_note_");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      expect(para.content[0]?.marks?.some((m) => m.type === "em")).toBe(true);
    }
  });

  it("converts table to ADF table nodes (phase 2)", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |"
    const doc = markdownToAdf(table);
    const block = doc.content[0];
    expect(block?.type).toBe("table");
    if (block?.type === "table") {
      expect(block.content).toHaveLength(2); // header row + 1 data row
      expect(block.content[0]?.type).toBe("tableRow");
      expect(block.content[0]?.content[0]?.type).toBe("tableHeader");
      expect(block.content[1]?.content[0]?.type).toBe("tableCell");
    }
  });

  it("handles plain text without markdown syntax (regression)", () => {
    const doc = markdownToAdf("Just plain text with no special chars.");
    expect(doc.content[0]?.type).toBe("paragraph");
    if (doc.content[0]?.type === "paragraph") {
      expect(doc.content[0].content[0]?.text).toBe("Just plain text with no special chars.");
    }
  });
});

describe("normalizeJiraBody", () => {
  it('wraps string in single paragraph when format is "plain"', () => {
    const doc = normalizeJiraBody("hello", "plain");
    expect(doc).toEqual(buildMinimalAdfDocument("hello"));
  });

  it('parses markdown when format is "markdown" (default)', () => {
    const doc = normalizeJiraBody("# Title", "markdown");
    expect(doc.content[0]?.type).toBe("heading");
  });

  it('passes through valid ADF when format is "adf"', () => {
    const adf = buildMinimalAdfDocument("Already ADF");
    expect(normalizeJiraBody(adf, "adf")).toEqual(adf);
  });

  it('rejects invalid ADF object when format is "adf"', () => {
    expect(() => normalizeJiraBody({ type: "wrong" }, "adf")).toThrow(/not a valid ADF/i);
  });

  it('rejects non-string body with "plain" format', () => {
    expect(() => normalizeJiraBody({ type: "wrong" }, "plain")).toThrow(/must be a string/i);
  });

  it('defaults to "markdown" format', () => {
    const doc = normalizeJiraBody("# Heading");
    expect(doc.content[0]?.type).toBe("heading");
  });
});

// ---------------------------------------------------------------------------
// Phase 2 tests
// ---------------------------------------------------------------------------

describe("jira_preview_adf handler", () => {
  it("returns ADF JSON for markdown input", async () => {
    const { handlePreviewAdf } = await import("../tools/preview-adf.js");
    const result = await handlePreviewAdf({ body: "# Title\n\n- item", bodyFormat: "markdown" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("ADF Preview");
    expect(result.content[0]?.text).toContain('"type": "doc"');
  });

  it("returns stats including node types", async () => {
    const { handlePreviewAdf } = await import("../tools/preview-adf.js");
    const result = await handlePreviewAdf({ body: "# H1\n\nParagraph", bodyFormat: "markdown" });
    expect(result.content[0]?.text).toContain("heading");
    expect(result.content[0]?.text).toContain("paragraph");
  });

  it("returns error for invalid input", async () => {
    const { handlePreviewAdf } = await import("../tools/preview-adf.js");
    const result = await handlePreviewAdf({ body: 123 });
    expect(result.isError).toBe(true);
  });

  it("includes table ADF node in output for GFM table", async () => {
    const { handlePreviewAdf } = await import("../tools/preview-adf.js");
    const result = await handlePreviewAdf({ body: "| A | B |\n|---|---|\n| 1 | 2 |", bodyFormat: "markdown" });
    expect(result.content[0]?.text).toContain('"type": "table"');
    expect(result.content[0]?.text).toContain('"type": "tableRow"');
  });
});

describe("markdownToAdf — table nodes (phase 2)", () => {
  it("table with multiple rows produces correct ADF structure", () => {
    const md = "| Col1 | Col2 |\n|---|---|\n| A | B |\n| C | D |";
    const doc = markdownToAdf(md);
    expect(doc.content[0]?.type).toBe("table");
    const table = doc.content[0];
    if (table?.type === "table") {
      expect(table.content).toHaveLength(3); // 1 header + 2 data rows
      expect(table.content[0]?.content[0]?.type).toBe("tableHeader");
      expect(table.content[1]?.content[0]?.type).toBe("tableCell");
    }
  });
});

describe("jira_add_comments bulk handler", () => {
  const mockConfig = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium" as const,
    ATTACHMENT_WORKSPACE: process.cwd(),
  };

  it("adds all comments and returns success table", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "addComment")
      .mockResolvedValueOnce({ id: "1", issueKey: "DNIEM-42", url: "https://jira.example.com/browse/DNIEM-42?focusedCommentId=1" })
      .mockResolvedValueOnce({ id: "2", issueKey: "DNIEM-42", url: "https://jira.example.com/browse/DNIEM-42?focusedCommentId=2" })
      .mockResolvedValueOnce({ id: "3", issueKey: "DNIEM-42", url: "https://jira.example.com/browse/DNIEM-42?focusedCommentId=3" });

    const result = await handleAddComments(
      {
        issueKey: "DNIEM-42",
        comments: [
          { body: "# [RAW]", bodyFormat: "markdown" },
          { body: "# [VI]", bodyFormat: "markdown" },
          { body: "# [ANALYSIS]", bodyFormat: "markdown" },
        ],
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("all added");
    expect(result.content[0]?.text).toContain("Success:** 3");
  });

  it("returns partial success with isError when one comment fails", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "addComment")
      .mockResolvedValueOnce({ id: "1", issueKey: "DNIEM-42", url: "https://jira.example.com/browse/DNIEM-42?focusedCommentId=1" })
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await handleAddComments(
      {
        issueKey: "DNIEM-42",
        comments: [
          { body: "first ok", bodyFormat: "plain" },
          { body: "second fails", bodyFormat: "plain" },
        ],
      },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("partial success");
    expect(result.content[0]?.text).toContain("Success:** 1");
    expect(result.content[0]?.text).toContain("Failed:** 1");
  });

  it("rejects invalid issueKey format", async () => {
    const result = await handleAddComments(
      { issueKey: "not-valid", comments: [{ body: "text" }] },
      mockConfig as never
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid input");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 tests
// ---------------------------------------------------------------------------

describe("isAdfDocument — strict validation", () => {
  it("accepts a valid ADF doc with version 1", () => {
    const valid = { type: "doc", version: 1, content: [] };
    expect(isAdfDocument(valid)).toBe(true);
  });

  it("rejects version 2 (not supported)", () => {
    expect(isAdfDocument({ type: "doc", version: 2, content: [] })).toBe(false);
  });

  it("rejects string version", () => {
    expect(isAdfDocument({ type: "doc", version: "1", content: [] })).toBe(false);
  });

  it("rejects missing content array", () => {
    expect(isAdfDocument({ type: "doc", version: 1 })).toBe(false);
  });

  it("normalizeJiraBody adf-format error includes specific violations", () => {
    expect(() =>
      normalizeJiraBody({ type: "doc", version: 2, content: [] }, "adf")
    ).toThrow(/version must be 1/i);
  });

  it("normalizeJiraBody adf-format error for wrong type", () => {
    expect(() =>
      normalizeJiraBody({ type: "paragraph", version: 1, content: [] }, "adf")
    ).toThrow(/type must be "doc"/i);
  });
});

describe("markdownToAdf — hardBreak node", () => {
  it('renders two-space line break as ADF hardBreak node (not text "\\n")', () => {
    // Two trailing spaces + newline = hard break in Markdown
    const doc = markdownToAdf("Line one  \nLine two");
    const para = doc.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      const hasHardBreak = para.content.some(
        (n) => (n as { type: string }).type === "hardBreak"
      );
      expect(hasHardBreak).toBe(true);
    }
  });
});

describe("update issue helpers", () => {
  it("exposes a curated allowlist for safe updates", () => {
    expect(UPDATEABLE_FIELDS).toContain(FIELD.SUMMARY);
    expect(UPDATEABLE_FIELDS).toContain(FIELD.DESCRIPTION);
    expect(UPDATEABLE_FIELDS).not.toContain(FIELD.PROJECT);
  });

  it("builds an update payload and normalizes description to ADF", () => {
    const payload = buildUpdateIssuePayload({
      [FIELD.SUMMARY]: "Updated summary",
      [FIELD.DESCRIPTION]: "Updated description",
      [FIELD.COMPONENTS]: [{ id: COMPONENT.QA }],
    });

    expect(payload).toEqual({
      fields: {
        [FIELD.SUMMARY]: "Updated summary",
        [FIELD.DESCRIPTION]: buildMinimalAdfDocument("Updated description"),
        [FIELD.COMPONENTS]: [{ id: COMPONENT.QA }],
      },
    });
  });

  it("rejects unsupported update fields", () => {
    expect(() =>
      buildUpdateIssuePayload({
        [FIELD.PROJECT]: { key: "DNIEM" },
      })
    ).toThrow(/unsupported fields/i);
  });
});

describe("create meta helpers", () => {
  it("returns full metadata for all issue types", () => {
    const meta = buildCreateMeta();
    expect(meta.issueTypes.length).toBeGreaterThan(5);
    expect(meta.issueTypes.some((it) => it.id === ISSUE_TYPE.TASK)).toBe(true);
  });

  it("returns a single issue type slice when requested", () => {
    const meta = buildCreateMeta(ISSUE_TYPE.TASK);
    expect(meta.issueTypes).toHaveLength(1);
    expect(meta.issueTypes[0]?.id).toBe(ISSUE_TYPE.TASK);
    expect(meta.issueTypes[0]?.requiredFields).toContain(CUSTOM_FIELD.DIFFICULTY_LEVEL);
  });

  it("exposes known field option maps for supported fields", () => {
    const options = getKnownFieldOptions();
    expect(options[CUSTOM_FIELD.PROJECT_STAGES]?.["CODING"]).toBeDefined();
    expect(options[FIELD.COMPONENTS]?.["QA"]).toBe(COMPONENT.QA);
  });
});

describe("transition/comment tool handlers", () => {
  const mockConfig = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium" as const,
    ATTACHMENT_WORKSPACE: process.cwd(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats add comment results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "addComment").mockResolvedValue({
      id: "10001",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    const result = await handleAddComment(
      { issueKey: "DNIEM-42", body: "Investigating now" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Comment added");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("sends ADF payload when bodyFormat is markdown (default)", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "addComment").mockResolvedValue({
      id: "10002",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    await handleAddComment(
      { issueKey: "DNIEM-42", body: "# Analysis\n\n- Point 1\n- Point 2" },
      mockConfig as never
    );

    const calledPayload = spy.mock.calls[0]?.[1];
    expect(calledPayload?.body).toMatchObject({ type: "doc", version: 1 });
    // The ADF content should have a heading and a bulletList
    const adfDoc = calledPayload?.body as { content: Array<{ type: string }> };
    expect(adfDoc.content.some((n) => n.type === "heading")).toBe(true);
    expect(adfDoc.content.some((n) => n.type === "bulletList")).toBe(true);
  });

  it("sends plain ADF paragraph when bodyFormat is plain", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "addComment").mockResolvedValue({
      id: "10003",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    await handleAddComment(
      { issueKey: "DNIEM-42", body: "# Not a heading in plain mode", bodyFormat: "plain" },
      mockConfig as never
    );

    const calledPayload = spy.mock.calls[0]?.[1];
    const adfDoc = calledPayload?.body as { content: Array<{ type: string }> };
    // With plain format, everything becomes a single paragraph — no heading node
    expect(adfDoc.content.every((n) => n.type === "paragraph")).toBe(true);
  });

  it("passes through ADF object when bodyFormat is adf", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "addComment").mockResolvedValue({
      id: "10004",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    const rawAdf = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "raw" }] }] };

    await handleAddComment(
      { issueKey: "DNIEM-42", body: rawAdf, bodyFormat: "adf" },
      mockConfig as never
    );

    const calledPayload = spy.mock.calls[0]?.[1];
    expect(calledPayload?.body).toEqual(rawAdf);
  });

  it("sends ADF payload when bodyFormat is markdown for update-comment", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "updateComment").mockResolvedValue({
      id: "10001",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });

    await handleUpdateComment(
      { issueKey: "DNIEM-42", commentId: "10001", body: "## Updated\n\nContent here" },
      mockConfig as never
    );

    const calledPayload = spy.mock.calls[0]?.[2];
    expect(calledPayload?.body).toMatchObject({ type: "doc", version: 1 });
    const adfDoc = calledPayload?.body as { content: Array<{ type: string }> };
    expect(adfDoc.content.some((n) => n.type === "heading")).toBe(true);
  });

  it("formats transition results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "transitionIssue").mockResolvedValue(undefined);

    const result = await handleTransitionIssue(
      { issueKey: "DNIEM-42", transitionId: "31", comment: "Done" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Transition applied");
    expect(result.content[0].text).toContain("31");
  });

  it("resolves transition by name before applying it", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getTransitions").mockResolvedValue([
      { id: "31", name: "Done", toStatus: "Done" },
    ]);
    vi.spyOn(JiraHttpClient.prototype, "transitionIssue").mockResolvedValue(undefined);

    const result = await handleTransitionIssue(
      { issueKey: "DNIEM-42", transitionName: "done" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("31");
    expect(result.content[0].text).toContain("Done");
  });

  it("rejects transition input with both id and name", async () => {
    const result = await handleTransitionIssue(
      { issueKey: "DNIEM-42", transitionId: "31", transitionName: "Done" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exactly one");
  });

  it("formats create meta results", async () => {
    const result = await handleGetCreateMeta({ issueTypeId: ISSUE_TYPE.TASK });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Task");
    expect(result.content[0].text).toContain(CUSTOM_FIELD.DIFFICULTY_LEVEL);
  });

  it("formats update issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "updateIssueFields").mockResolvedValue(undefined);

    const result = await handleUpdateIssueFields(
      {
        issueKey: "DNIEM-42",
        fields: {
          [FIELD.SUMMARY]: "Updated summary",
          [FIELD.DESCRIPTION]: "Updated description",
        },
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Issue updated");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("formats get transitions results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getTransitions").mockResolvedValue([
      { id: "11", name: "Start Progress", toStatus: "In Progress" },
    ]);

    const result = await handleGetTransitions(
      { issueKey: "DNIEM-42" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Start Progress");
  });

  it("formats find user results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "findUsers").mockResolvedValue([
      {
        key: "JIRAUSER10000",
        name: "alice",
        displayName: "Alice Nguyen",
        emailAddress: "alice@example.com",
        active: true,
      },
    ]);

    const result = await handleFindUser(
      { query: "alice", maxResults: 10 },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Alice Nguyen");
  });

  it("formats edit meta results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getEditMeta").mockResolvedValue({
      issueKey: "DNIEM-42",
      fields: [
        {
          id: "priority",
          name: "Priority",
          required: false,
          schemaType: "priority",
          allowedValues: [{ id: "3", name: "Medium", value: null }],
        },
      ],
    });

    const result = await handleGetEditMeta(
      { issueKey: "DNIEM-42" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("priority");
    expect(result.content[0].text).toContain("Medium");
  });

  it("formats link issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "linkIssues").mockResolvedValue({
      linkId: "20001",
    });

    const result = await handleLinkIssues(
      {
        inwardIssueKey: "DNIEM-42",
        outwardIssueKey: "DNIEM-43",
        linkType: "Blocks",
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Link created");
  });

  it("formats issue links and subtasks results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getIssueLinks").mockResolvedValue({
      issueKey: "DNIEM-42",
      links: [
        {
          id: "90001",
          type: "Blocks",
          direction: "outward",
          relationship: "blocks",
          issueKey: "DNIEM-43",
          summary: "Blocked task",
          status: "Open",
          issueType: "Task",
          url: "https://jira.example.com/browse/DNIEM-43",
        },
      ],
    });
    vi.spyOn(JiraHttpClient.prototype, "getSubtasks").mockResolvedValue({
      issueKey: "DNIEM-42",
      subtasks: [
        {
          key: "DNIEM-44",
          summary: "Subtask",
          status: "Open",
          issueType: "Sub-task",
          assignee: "Alice",
          priority: "Medium",
          url: "https://jira.example.com/browse/DNIEM-44",
        },
      ],
    });

    const linksResult = await handleGetIssueLinks({ issueKey: "DNIEM-42" }, mockConfig as never);
    const subtasksResult = await handleGetSubtasks({ issueKey: "DNIEM-42" }, mockConfig as never);

    expect(linksResult.isError).toBeUndefined();
    expect(linksResult.content[0].text).toContain("Blocked task");
    expect(subtasksResult.isError).toBeUndefined();
    expect(subtasksResult.content[0].text).toContain("Subtask");
  });

  it("formats create subtask and clone issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "createSubtask").mockResolvedValue({
      id: "10002",
      key: "DNIEM-44",
      url: "https://jira.example.com/browse/DNIEM-44",
    });
    vi.spyOn(JiraHttpClient.prototype, "cloneIssue").mockResolvedValue({
      id: "10003",
      key: "DNIEM-45",
      url: "https://jira.example.com/browse/DNIEM-45",
    });

    const subtaskResult = await handleCreateSubtask(
      {
        parentIssueKey: "DNIEM-42",
        issueTypeId: "10003",
        fields: { project: { key: "DNIEM" }, summary: "Subtask" },
      },
      mockConfig as never
    );
    const cloneResult = await handleCloneIssue(
      { sourceIssueKey: "DNIEM-42", summaryPrefix: "Clone of" },
      mockConfig as never
    );

    expect(subtaskResult.isError).toBeUndefined();
    expect(subtaskResult.content[0].text).toContain("Subtask created");
    expect(cloneResult.isError).toBeUndefined();
    expect(cloneResult.content[0].text).toContain("Issue cloned");
  });

  it("formats bulk link results with per-link status", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "linkIssues").mockResolvedValue({ linkId: "20001" });

    const result = await handleBulkLinkIssues(
      {
        links: [
          {
            inwardIssueKey: "DNIEM-42",
            outwardIssueKey: "DNIEM-43",
            linkType: "Blocks",
          },
        ],
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Bulk link complete");
    expect(result.content[0].text).toContain("20001");
  });

  it("previews create issue payload without calling Jira", async () => {
    const result = await handlePreviewCreateIssue({
      issueTypeId: ISSUE_TYPE.TASK,
      fields: {
        [FIELD.PROJECT]: { key: "DNIEM" },
        [FIELD.SUMMARY]: "Preview task",
        [CUSTOM_FIELD.DIFFICULTY_LEVEL]: { id: "10400" },
        [CUSTOM_FIELD.PROJECT_STAGES]: [{ id: "10300" }],
        [FIELD.DUE_DATE]: "2026-04-30",
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Create issue preview");
    expect(result.content[0].text).toContain("Preview task");
  });

  it("validates issue update fields against live edit meta", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getEditMeta").mockResolvedValue({
      issueKey: "DNIEM-42",
      fields: [
        {
          id: FIELD.SUMMARY,
          name: "Summary",
          required: false,
          schemaType: "string",
          allowedValues: [],
        },
      ],
    });

    const result = await handleValidateIssueUpdate(
      { issueKey: "DNIEM-42", fields: { [FIELD.SUMMARY]: "Updated" } },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("VALID");
    expect(result.content[0].text).toContain(FIELD.SUMMARY);
  });

  it("runs bulk update in dry-run mode without updating Jira", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const updateSpy = vi.spyOn(JiraHttpClient.prototype, "updateIssueFields").mockResolvedValue(undefined);

    const result = await handleBulkUpdateIssueFields(
      {
        dryRun: true,
        issues: [
          { issueKey: "DNIEM-42", fields: { [FIELD.SUMMARY]: "Updated summary" } },
        ],
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("DRY_RUN");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("runs bulk transitions with transitionName resolution in dry-run mode", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getTransitions").mockResolvedValue([
      { id: "31", name: "Done", toStatus: "Done" },
    ]);
    const transitionSpy = vi.spyOn(JiraHttpClient.prototype, "transitionIssue").mockResolvedValue(undefined);

    const result = await handleBulkTransitionIssues(
      {
        dryRun: true,
        issues: [{ issueKey: "DNIEM-42", transitionName: "Done" }],
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("DRY_RUN");
    expect(result.content[0].text).toContain("31");
    expect(transitionSpy).not.toHaveBeenCalled();
  });

  it("formats audit context from issue, links, subtasks, and comments", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getIssue").mockResolvedValue({
      key: "DNIEM-42",
      summary: "Audit target",
      url: "https://jira.example.com/browse/DNIEM-42",
      issueType: "Task",
      status: "Open",
      resolution: null,
      priority: "Medium",
      labels: [],
      components: [],
      affectsVersions: [],
      fixVersions: [],
      assignee: "Alice",
      reporter: "Bob",
      defectOwner: null,
      created: "2026-04-24",
      updated: "2026-04-24",
      dueDate: null,
      planStartDate: null,
      actualStartDate: null,
      actualEndDate: null,
      timeTracking: { originalEstimate: null, remainingEstimate: null, timeSpent: null },
      epicLink: null,
      epicName: null,
      parent: null,
      subtasks: [],
      projectStages: null,
      defectType: null,
      defectOrigin: null,
      causeCategory: null,
      severity: null,
      degrade: null,
      impactAssessment: null,
      causeAnalysis: null,
      action: null,
      dod: null,
      attachments: [],
      description: "Description",
    });
    vi.spyOn(JiraHttpClient.prototype, "getIssueLinks").mockResolvedValue({ issueKey: "DNIEM-42", links: [] });
    vi.spyOn(JiraHttpClient.prototype, "getSubtasks").mockResolvedValue({ issueKey: "DNIEM-42", subtasks: [] });
    vi.spyOn(JiraHttpClient.prototype, "getComments").mockResolvedValue([
      { id: "10001", author: "Alice", body: "Comment", created: "2026-04-24", updated: "2026-04-24" },
    ]);

    const result = await handleGetAuditContext(
      { issueKey: "DNIEM-42", includeComments: true },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Audit Context");
    expect(result.content[0].text).toContain("Audit target");
    expect(result.content[0].text).toContain("Comment");
  });

  it("formats assign issue results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "assignIssue").mockResolvedValue(undefined);

    const result = await handleAssignIssue(
      { issueKey: "DNIEM-42", assigneeName: "alice" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Issue assigned");
  });

  it("formats update and delete comment results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "updateComment").mockResolvedValue({
      id: "10001",
      issueKey: "DNIEM-42",
      url: "https://jira.example.com/browse/DNIEM-42",
    });
    vi.spyOn(JiraHttpClient.prototype, "deleteComment").mockResolvedValue(undefined);

    const updateResult = await handleUpdateComment(
      { issueKey: "DNIEM-42", commentId: "10001", body: "Updated" },
      mockConfig as never
    );
    const deleteResult = await handleDeleteComment(
      { issueKey: "DNIEM-42", commentId: "10001" },
      mockConfig as never
    );

    expect(updateResult.isError).toBeUndefined();
    expect(updateResult.content[0].text).toContain("Comment updated");
    expect(deleteResult.isError).toBeUndefined();
    expect(deleteResult.content[0].text).toContain("Comment deleted");
  });

  it("formats my worklogs results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "getCurrentUser").mockResolvedValue({
      key: "alice",
      name: "alice",
      displayName: "Alice",
    });
    vi.spyOn(JiraHttpClient.prototype, "getMyWorklogs").mockResolvedValue([
      {
        tempoWorklogId: 30001,
        issueKey: "DNIEM-42",
        issueSummary: "Fix login page",
        timeSpent: "2h",
        timeSpentSeconds: 7200,
        startDate: "2026-04-24",
        comment: "Implementation",
        process: "Coding",
        typeOfWork: "Create",
      },
    ]);

    const result = await handleGetMyWorklogs(
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Alice");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("formats update and delete worklog results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "updateWorklog").mockResolvedValue({
      tempoWorklogId: 30001,
      jiraWorklogId: 40001,
      workerKey: "alice",
      timeSpentSeconds: 3600,
      timeSpent: "1h",
      startDate: "2026-04-24",
      originTaskId: 42,
      comment: "Updated",
      billableSeconds: null,
      dateCreated: "2026-04-24",
      dateUpdated: "2026-04-24",
      issue: { key: "DNIEM-42", summary: "Task", projectKey: "DNIEM" },
    });
    vi.spyOn(JiraHttpClient.prototype, "deleteWorklog").mockResolvedValue(undefined);

    const updateResult = await handleUpdateWorklog(
      { worklogId: "30001", timeSpent: "1h", comment: "Updated" },
      mockConfig as never
    );
    const deleteResult = await handleDeleteWorklog(
      { worklogId: "30001" },
      mockConfig as never
    );

    expect(updateResult.isError).toBeUndefined();
    expect(updateResult.content[0].text).toContain("Worklog updated");
    expect(deleteResult.isError).toBeUndefined();
    expect(deleteResult.content[0].text).toContain("Worklog deleted");
  });

  it("formats attachment and metadata discovery results", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "addAttachment").mockResolvedValue([
      {
        id: "50001",
        filename: "README.md",
        size: 100,
        mimeType: "text/markdown",
        url: "https://jira.example.com/secure/attachment/50001/README.md",
      },
    ]);
    vi.spyOn(JiraHttpClient.prototype, "getProjects").mockResolvedValue([
      { id: "10000", key: "DNIEM", name: "DNIEM Project", url: "https://jira.example.com/projects/DNIEM" },
    ]);
    vi.spyOn(JiraHttpClient.prototype, "getComponents").mockResolvedValue([
      { id: "20000", name: "QA", description: "Quality" },
    ]);
    vi.spyOn(JiraHttpClient.prototype, "getPriorities").mockResolvedValue([
      { id: "3", name: "Medium", description: "Medium priority", iconUrl: "icon.png" },
    ]);

    const attachmentResult = await handleAddAttachment(
      { issueKey: "DNIEM-42", filePath: "README.md" },
      mockConfig as never
    );
    const projectsResult = await handleGetProjects({}, mockConfig as never);
    const componentsResult = await handleGetComponents(
      { projectKey: "DNIEM" },
      mockConfig as never
    );
    const prioritiesResult = await handleGetPriorities({}, mockConfig as never);

    expect(attachmentResult.isError).toBeUndefined();
    expect(attachmentResult.content[0].text).toContain("README.md");
    expect(projectsResult.content[0].text).toContain("DNIEM Project");
    expect(componentsResult.content[0].text).toContain("QA");
    expect(prioritiesResult.content[0].text).toContain("Medium");
  });
});

describe("upload attachment content tool handler", () => {
  const mockConfig = {
    JIRA_BASE_URL: "https://jira.example.com",
    JIRA_SESSION_FILE: ".jira/session.json",
    JIRA_VALIDATE_PATH: "/rest/api/2/myself",
    LOG_LEVEL: "info",
    PLAYWRIGHT_HEADLESS: false,
    PLAYWRIGHT_BROWSER: "chromium" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads utf8 text content and formats result table", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "uploadAttachmentFromBuffer").mockResolvedValue([
      {
        id: "60001",
        filename: "report.md",
        size: 256,
        mimeType: "text/markdown",
        url: "https://jira.example.com/secure/attachment/60001/report.md",
      },
    ]);

    const result = await handleUploadAttachmentContent(
      {
        issueKey: "DNIEM-42",
        filename: "report.md",
        content: "# Bug Report\n\nThis is the report.",
        encoding: "utf8",
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Attachment uploaded");
    expect(result.content[0].text).toContain("report.md");
    expect(result.content[0].text).toContain("60001");
    expect(result.content[0].text).toContain("256 B");
    expect(result.content[0].text).toContain("DNIEM-42");
  });

  it("uploads base64-encoded content correctly", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "uploadAttachmentFromBuffer").mockResolvedValue([
      {
        id: "60002",
        filename: "data.json",
        size: 64,
        mimeType: "application/json",
        url: "https://jira.example.com/secure/attachment/60002/data.json",
      },
    ]);

    const base64Content = Buffer.from('{"key":"value"}').toString("base64");

    const result = await handleUploadAttachmentContent(
      {
        issueKey: "DNIEM-42",
        filename: "data.json",
        content: base64Content,
        encoding: "base64",
      },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("data.json");
    // Verify the buffer was decoded from base64 before upload
    const calledBuffer = spy.mock.calls[0]?.[1] as Buffer;
    expect(calledBuffer.toString("utf8")).toBe('{"key":"value"}');
  });

  it("infers MIME type from filename extension when not provided", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "uploadAttachmentFromBuffer").mockResolvedValue([
      {
        id: "60003",
        filename: "export.csv",
        size: 128,
        mimeType: "text/csv",
        url: "https://jira.example.com/secure/attachment/60003/export.csv",
      },
    ]);

    await handleUploadAttachmentContent(
      {
        issueKey: "DNIEM-42",
        filename: "export.csv",
        content: "col1,col2\nval1,val2",
        encoding: "utf8",
      },
      mockConfig as never
    );

    // mimeType arg passed to client should be inferred as text/csv
    expect(spy.mock.calls[0]?.[3]).toBe("text/csv");
  });

  it("respects explicit mimeType override", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    const spy = vi.spyOn(JiraHttpClient.prototype, "uploadAttachmentFromBuffer").mockResolvedValue([
      {
        id: "60004",
        filename: "dump.log",
        size: 512,
        mimeType: "text/x-log",
        url: "https://jira.example.com/secure/attachment/60004/dump.log",
      },
    ]);

    await handleUploadAttachmentContent(
      {
        issueKey: "DNIEM-42",
        filename: "dump.log",
        content: "ERROR: something went wrong",
        mimeType: "text/x-log",
      },
      mockConfig as never
    );

    expect(spy.mock.calls[0]?.[3]).toBe("text/x-log");
  });

  it("rejects invalid issueKey format", async () => {
    const result = await handleUploadAttachmentContent(
      { issueKey: "invalid", filename: "file.txt", content: "data" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });

  it("rejects filename without extension", async () => {
    const result = await handleUploadAttachmentContent(
      { issueKey: "DNIEM-42", filename: "noextension", content: "data" },
      mockConfig as never
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });

  it("formats file sizes correctly", async () => {
    vi.mocked(sessionManager.loadAndValidateSession).mockResolvedValue({
      cookieHeader: "JSESSIONID=abc",
    });
    vi.spyOn(JiraHttpClient.prototype, "uploadAttachmentFromBuffer").mockResolvedValue([
      { id: "60005", filename: "big.txt", size: 1536, mimeType: "text/plain", url: null },
    ]);

    const result = await handleUploadAttachmentContent(
      { issueKey: "DNIEM-42", filename: "big.txt", content: "x".repeat(1536) },
      mockConfig as never
    );

    expect(result.isError).toBeUndefined();
    // 1536 bytes = 1.5 KB
    expect(result.content[0].text).toContain("1.5 KB");
  });
});

