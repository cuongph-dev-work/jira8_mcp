/**
 * markdown-to-wiki.ts
 *
 * Converts a Markdown string to Jira Server/Data Center Wiki Markup.
 * Jira Cloud uses ADF (JSON), but Jira Server 8.x uses Wiki Markup (plain text).
 *
 * Supported Markdown → Jira Wiki Markup mappings:
 *   # Heading 1            → h1. Heading 1
 *   ## Heading 2           → h2. Heading 2
 *   **bold**               → *bold*
 *   _italic_ / *italic*   → _italic_
 *   `inline code`          → {{inline code}}
 *   ~~strikethrough~~      → -strikethrough-
 *   [text](url)            → [text|url]
 *   - bullet               → * bullet
 *   1. ordered             → # ordered
 *   ```lang\ncode\n```     → {code:lang}\ncode\n{code}
 *   > blockquote           → {quote}...{quote}
 *   ---                    → ----
 *   | table | row |        → ||header|| / |cell|
 */

import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type {
  Root,
  RootContent,
  PhrasingContent,
  ListItem,
  Table,
  TableRow,
} from "mdast";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function markdownToWiki(markdown: string): string {
  const processor = remark().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown) as Root;
  return convertBlocks(tree.children).trim();
}

// ---------------------------------------------------------------------------
// Block-level conversion
// ---------------------------------------------------------------------------

function convertBlocks(nodes: RootContent[]): string {
  return nodes.map(convertBlock).filter(Boolean).join("\n");
}

function convertBlock(node: RootContent): string {
  switch (node.type) {
    case "heading":
      return `h${node.depth}. ${convertInline(node.children)}`;

    case "paragraph":
      return convertInline(node.children);

    case "list":
      return convertList(node.children as ListItem[], node.ordered ?? false, 1);

    case "code": {
      const lang = node.lang ? `:${node.lang}` : "";
      return `{code${lang}}\n${node.value}\n{code}`;
    }

    case "blockquote": {
      const inner = convertBlocks(node.children as RootContent[]);
      return `{quote}\n${inner}\n{quote}`;
    }

    case "table":
      return convertTable(node);

    case "thematicBreak":
      return "----";

    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// List conversion (recursive for nesting)
// ---------------------------------------------------------------------------

function convertList(
  items: ListItem[],
  ordered: boolean,
  depth: number
): string {
  const marker = ordered ? "#" : "*";
  const prefix = marker.repeat(depth);

  const lines: string[] = [];
  for (const item of items) {
    for (const child of item.children) {
      if (child.type === "paragraph") {
        lines.push(`${prefix} ${convertInline(child.children)}`);
      } else if (child.type === "list") {
        lines.push(
          convertList(
            child.children as ListItem[],
            child.ordered ?? false,
            depth + 1
          )
        );
      }
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Table conversion
// ---------------------------------------------------------------------------

function convertTable(node: Table): string {
  const [headerRow, ...bodyRows] = node.children as TableRow[];
  const lines: string[] = [];

  if (headerRow) {
    const cells = headerRow.children
      .map((cell) => convertInline(cell.children as PhrasingContent[]))
      .join("||");
    lines.push(`||${cells}||`);
  }

  for (const row of bodyRows) {
    const cells = row.children
      .map((cell) => convertInline(cell.children as PhrasingContent[]))
      .join("|");
    lines.push(`|${cells}|`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Inline (phrasing-content) conversion
// ---------------------------------------------------------------------------

function convertInline(children: PhrasingContent[]): string {
  return children.map(convertPhrasingNode).join("");
}

function convertPhrasingNode(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return node.value;

    case "inlineCode":
      return `{{${node.value}}}`;

    case "strong":
      return `*${convertInline(node.children)}*`;

    case "emphasis":
      return `_${convertInline(node.children)}_`;

    case "delete":
      return `-${convertInline(node.children)}-`;

    case "link": {
      const text = convertInline(node.children);
      return text ? `[${text}|${node.url}]` : `[${node.url}]`;
    }

    case "image":
      return `!${node.url}!`;

    case "break":
      return "\n";

    default:
      if ("children" in node && Array.isArray(node.children)) {
        return convertInline(node.children as PhrasingContent[]);
      }
      if ("value" in node && typeof node.value === "string") {
        return node.value;
      }
      return "";
  }
}
