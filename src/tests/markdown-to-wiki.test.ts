import { describe, it, expect } from "vitest";
import { markdownToWiki } from "../jira/markdown-to-wiki.js";

describe("markdownToWiki", () => {
  // -------------------------------------------------------------------------
  // Headings
  // -------------------------------------------------------------------------

  it("converts h1 heading", () => {
    expect(markdownToWiki("# Title")).toBe("h1. Title");
  });

  it("converts h2 heading", () => {
    expect(markdownToWiki("## Section")).toBe("h2. Section");
  });

  it("converts h3 heading", () => {
    expect(markdownToWiki("### Sub")).toBe("h3. Sub");
  });

  // -------------------------------------------------------------------------
  // Blank lines between block elements (key regression)
  // -------------------------------------------------------------------------

  it("separates heading and paragraph with blank line", () => {
    const md = `## Title\n\nSome text.`;
    const out = markdownToWiki(md);
    expect(out).toBe("h2. Title\n\nSome text.");
  });

  it("separates heading and list with blank line", () => {
    const md = `## Section\n\n- item 1\n- item 2`;
    const out = markdownToWiki(md);
    expect(out).toContain("h2. Section\n\n");
    expect(out).toContain("* item 1");
    expect(out).toContain("* item 2");
  });

  it("separates multiple sections with blank lines", () => {
    const md = `## A\n\nParagraph A.\n\n## B\n\nParagraph B.`;
    const out = markdownToWiki(md);
    expect(out).toBe("h2. A\n\nParagraph A.\n\nh2. B\n\nParagraph B.");
  });

  // -------------------------------------------------------------------------
  // Inline formatting
  // -------------------------------------------------------------------------

  it("converts bold", () => {
    expect(markdownToWiki("**bold**")).toBe("*bold*");
  });

  it("converts italic with underscore", () => {
    expect(markdownToWiki("_italic_")).toBe("_italic_");
  });

  it("converts italic with asterisk", () => {
    expect(markdownToWiki("*italic*")).toBe("_italic_");
  });

  it("converts strikethrough", () => {
    expect(markdownToWiki("~~strike~~")).toBe("-strike-");
  });

  it("converts link with text", () => {
    expect(markdownToWiki("[Google](https://google.com)")).toBe(
      "[Google|https://google.com]"
    );
  });

  it("converts bare link", () => {
    // bare URL becomes an autolink in GFM
    const out = markdownToWiki("[https://example.com](https://example.com)");
    expect(out).toBe("[https://example.com|https://example.com]");
  });

  // -------------------------------------------------------------------------
  // Inline code — curly brace escaping (key regression)
  // -------------------------------------------------------------------------

  it("wraps inline code in double braces", () => {
    expect(markdownToWiki("`hello`")).toBe("{{hello}}");
  });

  it("escapes { inside inline code to avoid Jira macro conflicts", () => {
    const out = markdownToWiki("`{dataFetchedAt} 更新`");
    expect(out).toBe(`{{\\{dataFetchedAt\\} 更新}}`);
    // Must NOT produce triple-brace start like {{{
    expect(out).not.toContain("{{{");
  });

  it("escapes } inside inline code", () => {
    const out = markdownToWiki("`foo}`");
    expect(out).toBe(`{{foo\\}}}`);
  });

  // -------------------------------------------------------------------------
  // Code blocks
  // -------------------------------------------------------------------------

  it("converts fenced code block without lang", () => {
    const md = "```\nconst x = 1;\n```";
    expect(markdownToWiki(md)).toBe("{code}\nconst x = 1;\n{code}");
  });

  it("converts fenced code block with lang", () => {
    const md = "```typescript\nconst x = 1;\n```";
    expect(markdownToWiki(md)).toBe("{code:typescript}\nconst x = 1;\n{code}");
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  it("converts unordered list", () => {
    const md = "- item 1\n- item 2";
    expect(markdownToWiki(md)).toBe("* item 1\n* item 2");
  });

  it("converts ordered list", () => {
    const md = "1. first\n2. second";
    expect(markdownToWiki(md)).toBe("# first\n# second");
  });

  it("converts nested unordered list", () => {
    const md = "- parent\n  - child";
    const out = markdownToWiki(md);
    expect(out).toContain("* parent");
    expect(out).toContain("** child");
  });

  // -------------------------------------------------------------------------
  // Blockquote
  // -------------------------------------------------------------------------

  it("converts blockquote", () => {
    const md = "> quoted text";
    const out = markdownToWiki(md);
    expect(out).toContain("{quote}");
    expect(out).toContain("quoted text");
    expect(out).toContain("{quote}");
  });

  // -------------------------------------------------------------------------
  // Thematic break
  // -------------------------------------------------------------------------

  it("converts horizontal rule", () => {
    expect(markdownToWiki("---")).toBe("----");
  });

  // -------------------------------------------------------------------------
  // Table
  // -------------------------------------------------------------------------

  it("converts table with header and body", () => {
    const md = `| H1 | H2 |\n|---|---|\n| A | B |`;
    const out = markdownToWiki(md);
    expect(out).toContain("||H1||H2||");
    expect(out).toContain("|A|B|");
  });

  // -------------------------------------------------------------------------
  // Text node — bracket escaping (prevents Jira link misparse)
  // -------------------------------------------------------------------------

  it("escapes [ and ] in plain text so Jira doesn't parse them as links", () => {
    const md = "This is [NON-BLOCKER] text.";
    const out = markdownToWiki(md);
    expect(out).toBe("This is \\[NON-BLOCKER\\] text.");
    // Must NOT contain bare brackets that Jira would interpret
    expect(out).not.toMatch(/(?<!\\)\[NON-BLOCKER(?<!\\)\]/);
  });

  it("escapes brackets in list items", () => {
    const md = "- [NON-BLOCKER] Fix later.";
    const out = markdownToWiki(md);
    expect(out).toContain("\\[NON-BLOCKER\\]");
  });

  it("does NOT escape brackets inside real links", () => {
    // remark parses [text](url) as a link node, not text —
    // the link handler adds its own [ ] wrapper.
    const out = markdownToWiki("[Click here](https://example.com)");
    expect(out).toBe("[Click here|https://example.com]");
  });

  // -------------------------------------------------------------------------
  // Real-world scenario: multi-section analysis doc
  // -------------------------------------------------------------------------

  it("renders multi-section doc with proper blank lines between all sections", () => {
    const md = [
      "## Raw Summary",
      "",
      "- **Lỗi:** Trang `safety-confirmation-management` bị crash.",
      "- **Hiện tượng:** React crash.",
      "",
      "## Open Questions",
      "",
      "- [NON-BLOCKER] Lỗi cụ thể hiển thị trên màn hình là gì?",
      "",
      "## Impact Hypothesis",
      "",
      "- **Root Cause:** Google Translate thay đổi text node.",
    ].join("\n");

    const out = markdownToWiki(md);

    // Heading must be followed by blank line before list
    expect(out).toContain("h2. Raw Summary\n\n");
    expect(out).toContain("h2. Open Questions\n\n");
    expect(out).toContain("h2. Impact Hypothesis\n\n");

    // [NON-BLOCKER] must be escaped to avoid Jira link misparse
    expect(out).toContain("\\[NON-BLOCKER\\]");

    // List items should NOT be separated by blank lines (stay compact)
    const listBlock = out.match(/\* \*Lỗi:\*.*\n\* \*Hiện tượng:\*/);
    expect(listBlock).not.toBeNull();

    // inline code path name should be present
    expect(out).toContain(`{{safety-confirmation-management}}`);
  });
});
