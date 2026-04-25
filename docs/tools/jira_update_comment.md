# jira_update_comment

Update an existing Jira issue comment with optional Markdown-to-ADF conversion.

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueKey` | `string` | ✅ | — | Jira issue key (e.g. `PROJ-123`) |
| `commentId` | `string` | ✅ | — | ID of the comment to update |
| `body` | `string \| ADF object` | ✅ | — | Replacement comment body |
| `bodyFormat` | `"plain" \| "markdown" \| "adf"` | ❌ | `"markdown"` | How to interpret `body` |

## Body Format Behavior

| `bodyFormat` | Behavior |
|---|---|
| `"markdown"` | **(default)** Parses `body` as Markdown and converts to ADF. Supports headings, bullet/ordered lists, code blocks, inline code, blockquotes, links, bold, italic. |
| `"plain"` | Wraps `body` string verbatim in a single ADF paragraph node. No Markdown parsing. |
| `"adf"` | Validates and forwards `body` as a raw ADF document object. Throws if the object is not a valid ADF doc. |

## API

- `PUT /rest/api/2/issue/{issueKey}/comment/{commentId}`
- Body is always sent as an ADF document (regardless of input format).

## Examples

```json
// Markdown update (default)
{
  "issueKey": "PROJ-123",
  "commentId": "10001",
  "body": "## [VI] Phân tích\n\n- Nguyên nhân: ...\n- Đề xuất: ..."
}

// Plain text update
{
  "issueKey": "PROJ-123",
  "commentId": "10001",
  "body": "Updated with findings.",
  "bodyFormat": "plain"
}
```

## Output

Markdown confirmation table with issue key, comment ID, and browser URL.
