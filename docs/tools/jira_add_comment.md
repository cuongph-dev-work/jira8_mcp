# jira_add_comment

Add a comment to a Jira issue with optional Markdown-to-ADF conversion.

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueKey` | `string` | ✅ | — | Jira issue key (e.g. `PROJ-123`) |
| `body` | `string \| ADF object` | ✅ | — | Comment body |
| `bodyFormat` | `"plain" \| "markdown" \| "adf"` | ❌ | `"markdown"` | How to interpret `body` |

## Body Format Behavior

| `bodyFormat` | Behavior |
|---|---|
| `"markdown"` | **(default)** Parses `body` as Markdown and converts to ADF. Supports headings, bullet/ordered lists, code blocks, inline code, blockquotes, links, bold, italic. |
| `"plain"` | Wraps `body` string verbatim in a single ADF paragraph node. No Markdown parsing. |
| `"adf"` | Validates and forwards `body` as a raw ADF document object. Throws if the object is not a valid ADF doc. |

## Supported Markdown Subset (phase 1)

- Headings: `#`, `##`, `###` (levels 1–6)
- Paragraph text
- Bullet list: `- item` / `* item`
- Ordered list: `1. item`
- Fenced code block: ` ```lang … ``` `
- Inline code: `` `code` ``
- Blockquote: `> text`
- Link: `[text](url)`
- Bold: `**text**`
- Italic: `_text_` / `*text*`
- Tables: rendered as plain-text code block (phase 1 fallback)

## Examples

```json
// Markdown comment (default)
{
  "issueKey": "PROJ-123",
  "body": "# Analysis\n\n- Root cause: ...\n- Fix: ...\n\nSee [ticket](https://jira.example.com/browse/PROJ-1)"
}

// Plain text
{
  "issueKey": "PROJ-123",
  "body": "Quick update: done.",
  "bodyFormat": "plain"
}

// Raw ADF pass-through
{
  "issueKey": "PROJ-123",
  "body": { "type": "doc", "version": 1, "content": [...] },
  "bodyFormat": "adf"
}
```

## Output

Markdown confirmation table with issue key, comment ID, and browser URL.
