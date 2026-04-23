# jira_get_issue

Fetch a single Jira issue by its key and return full details, including attachments.

## When to Use

- User asks about a specific Jira ticket (e.g. "what's the status of PROJ-123?")
- You need to understand the context, description, or current state of an issue
- You need to check who is assigned to or reported a ticket
- You need to view attached files (text, PDF, DOCX, images)
- Before making code changes related to a ticket, to understand requirements

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueKey` | `string` | ✅ | — | Jira issue key in `PROJECT-NUMBER` format (e.g. `PROJ-123`, `DEV-42`) |
| `includeAttachmentContent` | `boolean` | ❌ | `true` | When true, downloads and extracts content from readable attachments and includes images inline. Set to `false` for metadata only (faster). |

### Validation Rules

- `issueKey` must match pattern: `^[A-Z][A-Z0-9_]+-\d+$`
- Project prefix must start with an uppercase letter
- Number must be a positive integer
- Examples: `PROJ-1`, `MY_PROJ-999`, `AB-42`

## Output

Returns a markdown-formatted text block with the following sections:

### Issue Details

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Issue key (e.g. `PROJ-123`) |
| `summary` | `string` | Issue title |
| `description` | `string \| null` | Full description (plain text, ADF converted) |
| `status` | `string` | Current status name (e.g. `Open`, `In Progress`, `Done`) |
| `assignee` | `string \| null` | Display name of assignee, or `null` if unassigned |
| `reporter` | `string \| null` | Display name of reporter |
| `priority` | `string \| null` | Priority name (e.g. `High`, `Medium`, `Low`) |
| `issueType` | `string` | Issue type (e.g. `Bug`, `Task`, `Story`, `Epic`) |
| `created` | `string` | ISO 8601 creation timestamp |
| `updated` | `string` | ISO 8601 last update timestamp |
| `url` | `string` | Direct browser URL to the issue |

### Attachments

When an issue has attachments, a metadata table is included:

| Field | Description |
|-------|-------------|
| `filename` | File name with extension |
| `mimeType` | MIME type (e.g. `image/png`, `application/pdf`) |
| `size` | Human-readable file size |
| `author` | Display name of uploader |
| `created` | Upload timestamp |
| `downloadUrl` | Direct download URL |

**Content extraction** (when `includeAttachmentContent=true`):
- **Text files** (`text/*`, JSON, XML, YAML): raw text content shown in code block
- **PDF** (`application/pdf`): extracted text via pdf-parse
- **DOCX** (Office Open XML): extracted text via mammoth
- **Images** (`image/png`, `image/jpeg`, `image/gif`, `image/webp`): returned as inline MCP image content — the AI can "see" them

**Safety limits**:
| Limit | Value |
|-------|-------|
| Max readable files | 5 per issue |
| Max text per file | 50 KB |
| Max total text | 200 KB |
| Max images inline | 3 per issue |
| Max image size | 5 MB |

Files exceeding limits show a truncation warning with the download URL.

## Error Cases

| Error Code | Meaning | Action |
|------------|---------|--------|
| `AUTH_REQUIRED` | No session file found | Run `npm run jira-auth-login` |
| `SESSION_EXPIRED` | Session cookies expired | Run `npm run jira-auth-login` |
| `JIRA_HTTP_ERROR` | Jira returned non-2xx (e.g. 404 = issue not found) | Check issue key |
| `JIRA_RESPONSE_ERROR` | Unexpected response shape | Report to maintainer |

All errors return `isError: true` in the MCP response.

## Examples

### Basic (with attachment content)

```json
{
  "name": "jira_get_issue",
  "arguments": {
    "issueKey": "PROJ-123"
  }
}
```

### Metadata only (no content download)

```json
{
  "name": "jira_get_issue",
  "arguments": {
    "issueKey": "PROJ-123",
    "includeAttachmentContent": false
  }
}
```

### Example output with attachments

```markdown
# PROJ-123: Fix login timeout on SSO redirect

**URL:** https://jira.yourcompany.com/browse/PROJ-123

## Details

| Field | Value |
|-------|-------|
| **Type** | Bug |
| **Status** | In Progress |
| **Priority** | High |

## Attachments (2)

| File | Type | Size | Author | Date | URL |
|------|------|------|--------|------|-----|
| error_log.txt | text/plain | 12.3 KB | Alice | 15 Jan 2024, 10:00 | https://... |
| screenshot.png | image/png | 245.7 KB | Bob | 16 Jan 2024, 14:30 | https://... |

### 📄 error_log.txt

\`\`\`
2024-01-15 09:58:32 ERROR SSO redirect timeout after 30s
2024-01-15 09:58:32 ERROR Session cookie not set
\`\`\`

## Description

Users are experiencing a timeout when the SSO redirect takes longer than 30 seconds.
```
