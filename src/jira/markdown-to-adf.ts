/**
 * markdown-to-adf.ts
 *
 * Converts a Markdown string to an Atlassian Document Format (ADF) document
 * using the `remark` AST. Only a subset of Markdown nodes are handled;
 * unrecognised nodes fall back to plain-text paragraphs.
 *
 * Supported Markdown → ADF mappings:
 *   heading (#/##/###)     → heading (level 1–6)
 *   paragraph              → paragraph
 *   list (bullet)          → bulletList / listItem
 *   list (ordered)         → orderedList / listItem
 *   code (fenced/indented) → codeBlock
 *   inlineCode             → text + code mark
 *   blockquote             → blockquote
 *   link [text](url)       → text + link mark
 *   strong **text**        → text + strong mark
 *   emphasis _text_        → text + em mark
 *   table (GFM)            → table / tableRow / tableHeader / tableCell
 */

import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent, ListItem, Table, TableRow } from "mdast";
import type {
  AdfDocument,
  AdfNode,
  AdfTextNode,
  AdfMark,
  AdfParagraphNode,
  AdfHeadingNode,
  AdfBulletListNode,
  AdfOrderedListNode,
  AdfListItemNode,
  AdfCodeBlockNode,
  AdfBlockquoteNode,
  AdfTableNode,
  AdfTableRowNode,
  AdfTableHeaderNode,
  AdfTableCellNode,
} from "./adf.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function markdownToAdf(markdown: string): AdfDocument {
  const processor = remark().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown) as Root;
  return { type: "doc", version: 1, content: convertChildren(tree.children) };
}

// ---------------------------------------------------------------------------
// Block-level conversion
// ---------------------------------------------------------------------------

function convertChildren(nodes: RootContent[]): AdfNode[] {
  const result: AdfNode[] = [];
  for (const node of nodes) {
    const converted = convertBlock(node);
    if (converted) result.push(converted);
  }
  return result;
}

function convertBlock(node: RootContent): AdfNode | null {
  switch (node.type) {
    case "paragraph":
      return convertParagraph(node.children);

    case "heading":
      return convertHeading(node.depth, node.children);

    case "list":
      return node.ordered
        ? convertOrderedList(node.children as ListItem[])
        : convertBulletList(node.children as ListItem[]);

    case "code":
      return convertCodeBlock(node.value, node.lang ?? undefined);

    case "blockquote": {
      // blockquote children are block-level; collect their inline content
      const paragraphs: AdfParagraphNode[] = [];
      for (const child of node.children) {
        if (child.type === "paragraph") {
          paragraphs.push(convertParagraph(child.children));
        }
      }
      if (paragraphs.length === 0) return null;
      const bq: AdfBlockquoteNode = { type: "blockquote", content: paragraphs };
      return bq;
    }

    case "table":
      return convertTable(node);

    case "thematicBreak":
      // Render as an empty paragraph — ADF has no HR equivalent
      return { type: "paragraph", content: [] };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

function convertParagraph(children: PhrasingContent[]): AdfParagraphNode {
  return { type: "paragraph", content: convertInline(children) };
}

function convertHeading(level: number, children: PhrasingContent[]): AdfHeadingNode {
  return {
    type: "heading",
    attrs: { level: Math.min(Math.max(level, 1), 6) },
    content: convertInline(children),
  };
}

function convertBulletList(items: ListItem[]): AdfBulletListNode {
  return { type: "bulletList", content: items.map(convertListItem) };
}

function convertOrderedList(items: ListItem[]): AdfOrderedListNode {
  return { type: "orderedList", content: items.map(convertListItem) };
}

function convertListItem(item: ListItem): AdfListItemNode {
  const content: AdfListItemNode["content"] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") {
      content.push(convertParagraph(child.children));
    } else if (child.type === "list") {
      content.push(
        child.ordered
          ? convertOrderedList(child.children as ListItem[])
          : convertBulletList(child.children as ListItem[])
      );
    }
  }
  if (content.length === 0) {
    content.push({ type: "paragraph", content: [] });
  }
  return { type: "listItem", content };
}

function convertCodeBlock(code: string, lang?: string): AdfCodeBlockNode {
  const node: AdfCodeBlockNode = {
    type: "codeBlock",
    attrs: lang ? { language: lang } : {},
    content: code ? [{ type: "text", text: code }] : [],
  };
  return node;
}

function convertTable(node: Table): AdfTableNode {
  const [headerRow, ...bodyRows] = node.children as TableRow[];
  const rows: AdfTableRowNode[] = [];

  // First row → tableHeader cells
  if (headerRow) {
    const headerCells: AdfTableHeaderNode[] = headerRow.children.map((cell) => ({
      type: "tableHeader" as const,
      attrs: {},
      content: [convertParagraph(cell.children as PhrasingContent[])],
    }));
    rows.push({ type: "tableRow", content: headerCells });
  }

  // Body rows → tableCell cells
  for (const row of bodyRows) {
    const cells: AdfTableCellNode[] = row.children.map((cell) => ({
      type: "tableCell" as const,
      attrs: {},
      content: [convertParagraph(cell.children as PhrasingContent[])],
    }));
    rows.push({ type: "tableRow", content: cells });
  }

  return { type: "table", attrs: { isNumberColumnEnabled: false, layout: "default" }, content: rows };
}

// ---------------------------------------------------------------------------
// Inline (phrasing-content) conversion
// ---------------------------------------------------------------------------

function convertInline(children: PhrasingContent[]): AdfTextNode[] {
  const result: AdfTextNode[] = [];
  for (const child of children) {
    result.push(...convertPhrasingNode(child, []));
  }
  return result;
}

function convertPhrasingNode(
  node: PhrasingContent,
  inheritedMarks: AdfMark[]
): AdfTextNode[] {
  switch (node.type) {
    case "text":
      return node.value ? [makeTextNode(node.value, inheritedMarks)] : [];

    case "inlineCode":
      return [makeTextNode(node.value, [...inheritedMarks, { type: "code" }])];

    case "strong": {
      const marks: AdfMark[] = [...inheritedMarks, { type: "strong" }];
      return node.children.flatMap((c) => convertPhrasingNode(c, marks));
    }

    case "emphasis": {
      const marks: AdfMark[] = [...inheritedMarks, { type: "em" }];
      return node.children.flatMap((c) => convertPhrasingNode(c, marks));
    }

    case "link": {
      const linkMark: AdfMark = {
        type: "link",
        attrs: { href: node.url, title: node.title ?? null },
      };
      const marks: AdfMark[] = [...inheritedMarks, linkMark];
      return node.children.flatMap((c) => convertPhrasingNode(c, marks));
    }

    case "image":
      // Render as a text node with alt text — ADF inline images need media nodes
      return [
        makeTextNode(
          node.alt ?? node.url,
          [...inheritedMarks, { type: "link", attrs: { href: node.url } }]
        ),
      ];

    case "break":
      // Hard line break → ADF hardBreak node (typed as text for simplicity)
      return [{ type: "text", text: "\n" }];

    case "delete": {
      const marks: AdfMark[] = [...inheritedMarks, { type: "strike" }];
      return node.children.flatMap((c) => convertPhrasingNode(c, marks));
    }

    default:
      // Unknown inline node — try to extract plain text
      if ("children" in node && Array.isArray(node.children)) {
        return (node.children as PhrasingContent[]).flatMap((c) =>
          convertPhrasingNode(c, inheritedMarks)
        );
      }
      if ("value" in node && typeof node.value === "string") {
        return node.value ? [makeTextNode(node.value, inheritedMarks)] : [];
      }
      return [];
  }
}

function makeTextNode(text: string, marks: AdfMark[]): AdfTextNode {
  return marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

// ---------------------------------------------------------------------------
// Utility: extract plain text from a phrasing content array
// ---------------------------------------------------------------------------

export function extractPlainText(children: PhrasingContent[]): string {
  return children
    .map((c) => {
      if (c.type === "text" || c.type === "inlineCode") return c.value;
      if ("children" in c && Array.isArray(c.children))
        return extractPlainText(c.children as PhrasingContent[]);
      return "";
    })
    .join("");
}
