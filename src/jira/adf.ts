import { invalidInput } from "../errors.js";
import { markdownToAdf } from "./markdown-to-adf.js";

// ---------------------------------------------------------------------------
// ADF node type interfaces
// ---------------------------------------------------------------------------

export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface AdfTextNode {
  type: "text";
  text: string;
  marks?: AdfMark[];
}

export interface AdfParagraphNode {
  type: "paragraph";
  content: AdfTextNode[];
}

export interface AdfHeadingNode {
  type: "heading";
  attrs: { level: number };
  content: AdfTextNode[];
}

export interface AdfListItemNode {
  type: "listItem";
  content: Array<AdfParagraphNode | AdfBulletListNode | AdfOrderedListNode>;
}

export interface AdfBulletListNode {
  type: "bulletList";
  content: AdfListItemNode[];
}

export interface AdfOrderedListNode {
  type: "orderedList";
  content: AdfListItemNode[];
}

export interface AdfCodeBlockNode {
  type: "codeBlock";
  attrs?: { language?: string };
  content: AdfTextNode[];
}

export interface AdfBlockquoteNode {
  type: "blockquote";
  content: Array<AdfParagraphNode>;
}

export interface AdfTableCellNode {
  type: "tableCell";
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] };
  content: Array<AdfParagraphNode>;
}

export interface AdfTableHeaderNode {
  type: "tableHeader";
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] };
  content: Array<AdfParagraphNode>;
}

export interface AdfTableRowNode {
  type: "tableRow";
  content: Array<AdfTableHeaderNode | AdfTableCellNode>;
}

export interface AdfTableNode {
  type: "table";
  attrs?: { isNumberColumnEnabled?: boolean; layout?: string };
  content: AdfTableRowNode[];
}

export type AdfNode =
  | AdfParagraphNode
  | AdfHeadingNode
  | AdfBulletListNode
  | AdfOrderedListNode
  | AdfCodeBlockNode
  | AdfBlockquoteNode
  | AdfTableNode;

export interface AdfDocument {
  type: "doc";
  version: number;
  content: AdfNode[];
}

// ---------------------------------------------------------------------------
// Body format discriminant
// ---------------------------------------------------------------------------

export type JiraBodyFormat = "plain" | "markdown" | "adf";

// ---------------------------------------------------------------------------
// Builders & validators
// ---------------------------------------------------------------------------

export function buildMinimalAdfDocument(text: string): AdfDocument {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export function isAdfDocument(value: unknown): value is AdfDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const maybeDoc = value as {
    type?: unknown;
    version?: unknown;
    content?: unknown;
  };

  return (
    maybeDoc.type === "doc" &&
    typeof maybeDoc.version === "number" &&
    Array.isArray(maybeDoc.content)
  );
}

/**
 * Normalizes a comment/description body to ADF based on the supplied format.
 *
 * - "plain"    – wraps the raw string in a single paragraph ADF node.
 * - "markdown" – parses Markdown subset into rich ADF (headings, lists, code
 *                blocks, inline marks, links, blockquotes).
 * - "adf"      – validates and passes through an already-structured ADF object.
 *
 * @throws McpError (invalidInput) when the value cannot be converted.
 */
export function normalizeJiraBody(
  body: string | AdfDocument | Record<string, unknown>,
  format: JiraBodyFormat = "markdown"
): AdfDocument {
  if (format === "adf") {
    if (isAdfDocument(body)) return body;
    throw invalidInput(
      "bodyFormat is \"adf\" but body is not a valid ADF document object."
    );
  }

  if (typeof body !== "string") {
    // If a non-string is passed with plain/markdown format, try ADF pass-through
    if (isAdfDocument(body)) return body;
    throw invalidInput(
      "body must be a string when bodyFormat is \"plain\" or \"markdown\"."
    );
  }

  if (format === "plain") {
    return buildMinimalAdfDocument(body);
  }

  // format === "markdown"
  return markdownToAdf(body);
}

// Legacy — keep for backward compat with existing callers outside tools
export function normalizeAdfValue(value: unknown): string | AdfDocument {
  if (typeof value === "string") {
    return buildMinimalAdfDocument(value);
  }

  if (isAdfDocument(value)) {
    return value;
  }

  throw invalidInput("description/comment body must be a string or a valid ADF document.");
}
