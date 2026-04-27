#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { ISSUE_TYPE } from "./jira/constants.js";
import { handleAddComment } from "./tools/add-comment.js";
import { handleAddAttachment } from "./tools/add-attachment.js";
import { handleUploadAttachmentContent } from "./tools/upload-attachment-content.js";
import { handleAssignIssue } from "./tools/assign-issue.js";
import { handleBulkLinkIssues } from "./tools/bulk-link-issues.js";
import { handleBulkTransitionIssues } from "./tools/bulk-transition-issues.js";
import { handleBulkUpdateIssueFields } from "./tools/bulk-update-issue-fields.js";
import { handleCloneIssue } from "./tools/clone-issue.js";
import { handleCreateIssue } from "./tools/create-issue.js";
import { handleCreateSubtask } from "./tools/create-subtask.js";
import { handleDeleteComment } from "./tools/delete-comment.js";
import { handleDeleteIssue } from "./tools/delete-issue.js";
import { handleDeleteWorklog } from "./tools/delete-worklog.js";
import { handleFindUser } from "./tools/find-user.js";
import { handleGetComments } from "./tools/get-comments.js";
import { handleGetComponents } from "./tools/get-components.js";
import { handleGetAuditContext } from "./tools/get-audit-context.js";
import { handleGetIssue } from "./tools/get-issue.js";
import { handleGetIssueLinks } from "./tools/get-issue-links.js";
import { handleGetCreateMeta } from "./tools/get-create-meta.js";
import { handleGetEditMeta } from "./tools/get-edit-meta.js";
import { handleGetMyWorklogs } from "./tools/get-my-worklogs.js";
import { handleGetPriorities } from "./tools/get-priorities.js";
import { handleGetProjects } from "./tools/get-projects.js";
import { handleGetSubtasks } from "./tools/get-subtasks.js";
import { handleGetTransitions } from "./tools/get-transitions.js";
import { handleLinkIssues } from "./tools/link-issues.js";
import { handlePreviewCreateIssue } from "./tools/preview-create-issue.js";
import { handleSearchIssues } from "./tools/search-issues.js";
import { handleSmartSearch, smartSearchToolSchema } from "./tools/smart-search.js";
import { handleTransitionIssue } from "./tools/transition-issue.js";
import { handleUpdateComment } from "./tools/update-comment.js";
import { handleUpdateIssueFields } from "./tools/update-issue-fields.js";
import { handleUpdateWorklog } from "./tools/update-worklog.js";
import { handleValidateIssueUpdate } from "./tools/validate-issue-update.js";
import { handleAddWorklog } from "./tools/add-worklog.js";
import { handlePreviewAdf } from "./tools/preview-adf.js";
import { handleAddComments } from "./tools/add-comments.js";

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "jira-run-mcp",
    version: "0.1.0",
  });

  // Tool: jira_get_issue
  server.tool(
    "jira_get_issue",
    `Fetch a single Jira issue by key and return its full details.

Returns: summary, description, status, assignee, reporter, priority, type, dates, time tracking, sub-tasks, bug/defect fields, and attachments.

ATTACHMENTS:
- Metadata (filename, type, size, author, date, URL) is ALWAYS included in the response.
- Content extraction is OFF by default. Set includeAttachmentContent=true ONLY when the user explicitly asks about attachments, attached files, or images.
- Readable files: text/*, PDF, DOCX → extracted text (max 50KB/file, 200KB total).
- Images: PNG/JPEG/GIF/WEBP → returned inline so AI can see them (max 5MB/image).
- Use maxImages and maxReadableFiles to control how many are downloaded.`,
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      includeAttachmentContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Download attachment content. Default false — set true ONLY when user asks about attachments/files/images."),
      maxImages: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .default(3)
        .describe("Max images to include inline (0-10, default 3)."),
      maxReadableFiles: z
        .number()
        .int()
        .min(0)
        .max(20)
        .optional()
        .default(5)
        .describe("Max text/PDF/DOCX files to extract content from (0-20, default 5)."),
    },
    async (input) => {
      return handleGetIssue(input, config);
    }
  );

  // Tool: jira_search_issues
  server.tool(
    "jira_search_issues",
    `Execute a JQL query against Jira and return a compact list of matching issues.

JQL SYNTAX RULES (follow strictly):
- Time tracking fields (timespent, timeestimate, originalEstimate): use natural duration strings like "65h", "3d 4h", "30m" — NEVER convert to seconds or minutes yourself.
  Example: timespent > "65h"  (correct) | timespent > 234000 (wrong)

SCRIPTRUNNER JQL FUNCTIONS (available via issueFunction field, full docs in docs/jql-functions-scriptrunner.md):

ISSUE LINKS:
- issueFunction in hasLinks("blocks")                         — issues with "blocks" links
- issueFunction in hasLinkType("Blocks")                      — link type (any direction)
- issueFunction in linkedIssuesOf("status = Open", "blocks")  — linked TO matching issues
- issueFunction in linkedIssuesOfRecursive("issue = X-1")     — recursively linked
- issueFunction in linkedIssuesOfRecursiveLimited("project = X", 2) — recursive with depth limit
- issueFunction in epicsOf("resolution = unresolved")         — epics with unresolved children
- issueFunction in issuesInEpics("status = 'To Do'")          — issues inside matching epics

SUB-TASKS:
- issueFunction in hasSubtasks()                              — parent issues with subtasks
- issueFunction in subtasksOf("assignee = currentUser()")     — subtasks of matching issues
- issueFunction in parentsOf("status = Open")                 — parents of matching subtasks

DATES:
- issueFunction in dateCompare("", "resolutionDate > dueDate") — compare two date fields (supports +Nd, +Nw time windows)
- issueFunction in lastUpdated("by currentUser()")            — last updated by user/role/group

CALCULATIONS:
- issueFunction in expression("", "timespent > originalestimate")              — compare numeric/duration/date fields
- issueFunction in expression("resolution is empty", "now() + fromTimeTracking(remainingestimate) > duedate") — will miss due date
- issueFunction in aggregateExpression("Total", "originalEstimate.sum()")      — aggregate calculations (.sum(), .average(), .count())

COMMENTS:
- issueFunction in hasComments()                              — issues with any comments
- issueFunction in hasComments('+5')                          — more than 5 comments
- issueFunction in commented("after -7d by currentUser()")    — commented by user/date/role
- issueFunction not in lastComment("inRole Developers")       — last comment NOT by role

ATTACHMENTS:
- issueFunction in hasAttachments("pdf")                      — issues with PDF attachments
- issueFunction in fileAttached("after -1w by currentUser()") — attachments by user/date

WORKLOGS:
- issueFunction in workLogged("after startOfMonth() by currentUser()") — work logged by user/role/date

USERS:
- assignee in inactiveUsers()                                 — inactive users
- issueFunction in memberOfRole("Reporter", "Administrators") — user in role

MATCH/REGEX:
- issueFunction in issueFieldMatch("project = X", "description", "ABC\\\\d{4}") — regex match on fields
- issueFunction in issueFieldExactMatch("project = X", "Error Code", "ERR-404") — exact match
- project in projectMatch("^Test.*")                          — project name regex

VERSIONS:
- fixVersion in releaseDate("after now() before 10d")         — by release date
- fixVersion in overdue()                                     — overdue versions
- fixVersion in archivedVersions()                            — archived versions

PROJECTS:
- project in myProjects()                                     — current user's projects
- project in recentProjects()                                 — recently viewed projects

SPRINT:
- issueFunction in addedAfterSprintStart("project = X", "Sprint 1")   — added after sprint start
- issueFunction in completeInSprint("project = X", "Sprint 1")        — completed in sprint
- issueFunction in incompleteInSprint("project = X", "Sprint 1")      — incomplete in sprint

DATE FORMATS: yyyy/MM/dd, period (-5d, -1w), date functions (startOfMonth(), endOfMonth(), startOfDay(), now(), lastLogin()).`,
    {
      jql: z.string().describe("JQL query string. For time tracking use natural duration strings like '65h' not seconds. ScriptRunner functions use: issueFunction in <fn>(<subquery>)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Maximum number of results to return (1–50, default 10)"),
      startAt: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("0-based index of the first result to return. Use with limit for pagination. E.g. startAt=50, limit=50 returns results 51–100."),
      orderBy: z
        .enum([
          "summary", "issuetype", "issuekey", "created", "updated",
          "timespent", "originalEstimate", "remainingEstimate", "priority",
          "dueDate", "assignee", "status", "typeOfWork", "defectOwner",
          "planStartDate", "defectOrigin", "actualStartDate", "severity",
          "actualEndDate", "percentDone"
        ] as const)
        .optional()
        .describe("Field to sort by. Custom fields use cf[id] syntax internally."),
      order: z
        .enum(["ASC", "DESC"])
        .optional()
        .default("DESC")
        .describe("Sort order: ASC or DESC (default DESC)"),
    },
    async (input) => {
      return handleSearchIssues(input, config);
    }
  );

  server.tool(
    "jira_smart_search",
    `Search Jira with an issue key, explicit JQL, or natural-language filters.

AUTO MODE:
- Issue key like DNIEM-42 returns a direct issue lookup.
- Explicit JQL like project = DNIEM AND status = Open runs unchanged.
- Natural text like "open bugs assigned to me updated last 7 days" is converted to safe JQL.

SUPPORTED SMART FILTERS:
- project: Jira project key, e.g. DNIEM
- issue intent: bug/task/story/epic/sub-task
- status intent: open/unresolved/done/closed/resolved/in progress/to do
- assignee intent: assigned to me, my issues, unassigned
- recency: updated last N days, created last N days
- attachments: has pdf attachment
- fallback text search: text ~ query`,
    smartSearchToolSchema,
    async (input) => {
      return handleSmartSearch(input, config);
    }
  );

  // Tool: jira_add_worklog
  server.tool(
    "jira_add_worklog",
    `Log work (create a worklog) on a Jira issue via Tempo Timesheets.

Automatically detects the current authenticated user — always logs work as yourself.

DURATION FORMAT:
- Use Nd (days = 8 hours), Nh (hours), Nm (minutes)
- Examples: "2h", "30m", "1d", "1d 4h 30m"

DATE FORMAT: yyyy-MM-dd (e.g. "2026-04-24")

WORK ATTRIBUTES:
- process: Project Management, Requirement, Design_UI/UX, Design Basic, Design Detail, Coding, Test UT, Test IT, Test Other, Deployment, UAT, Configuaration Management, Other_billable, Other_unbillable
- typeOfWork: Create, Correct, Study, Review, Test, Translate

Returns: confirmation with Tempo worklog ID, issue details, and logged duration.`,
    {
      issueKey: z.string().describe("Jira issue key to log work against, e.g. PROJ-123"),
      timeSpent: z
        .string()
        .describe('Duration: use Nd (days=8h), Nh, Nm. Examples: "2h", "1d 4h 30m"'),
      startDate: z
        .string()
        .optional()
        .describe("Date of work in yyyy-MM-dd format (defaults to today)"),
      comment: z
        .string()
        .optional()
        .describe("Description of work performed"),
      process: z
        .string()
        .optional()
        .describe("Tempo Process attribute (e.g. Coding, Test UT, Requirement)"),
      typeOfWork: z
        .string()
        .optional()
        .describe("Tempo Type Of Work attribute (Create, Correct, Study, Review, Test, Translate)"),
      includeNonWorkingDays: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include weekends/holidays in multi-day worklogs (default false)"),
    },
    async (input) => {
      return handleAddWorklog(input, config);
    }
  );

  server.tool(
    "jira_add_comment",
    "Add a comment to a Jira issue. Supports Markdown-to-Jira-Wiki-Markup conversion (default) or plain text/Wiki Markup pass-through. Targets Jira Server v8.x.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      body: z.string().describe("Comment body as plain text, Jira Wiki Markup, or Markdown string."),
      bodyFormat: z
        .enum(["plain", "markdown"])
        .optional()
        .default("markdown")
        .describe('How to interpret body: "markdown" (default, converts Markdown to Jira Wiki Markup), "plain" (pass-through as-is).'),
    },
    async (input) => {
      return handleAddComment(input, config);
    }
  );

  server.tool(
    "jira_get_comments",
    "List comments on a Jira issue, ordered by newest first.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      maxResults: z.number().int().min(1).max(100).optional().default(20).describe("Maximum comments to return (1-100, default 20)."),
    },
    async (input) => {
      return handleGetComments(input, config);
    }
  );

  server.tool(
    "jira_transition_issue",
    "Transition a Jira issue by transitionId or transitionName, with optional comment and field updates.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      transitionId: z.string().optional().describe("Transition ID from jira_get_transitions. Provide exactly one of transitionId or transitionName."),
      transitionName: z.string().optional().describe("Transition name to resolve from current available transitions. Provide exactly one of transitionId or transitionName."),
      comment: z.string().optional().describe("Optional transition comment as plain text."),
      fields: z.record(z.unknown()).optional().describe("Optional field updates to send with the transition."),
    },
    async (input) => {
      return handleTransitionIssue(input, config);
    }
  );

  server.tool(
    "jira_get_create_meta",
    "Return static create metadata for Jira issue types from src/jira/constants.ts, including required fields, optional fields, and known option sets.",
    {
      issueTypeId: z.nativeEnum(ISSUE_TYPE).optional().describe("Optional issue type ID to narrow the returned metadata."),
    },
    async (input) => {
      return handleGetCreateMeta(input);
    }
  );

  server.tool(
    "jira_find_user",
    "Search Jira users by username/display name and return normalized identity fields for assignment/collaboration flows.",
    {
      query: z.string().describe("Search text, typically username or display name."),
      maxResults: z.number().int().min(1).max(50).optional().default(10).describe("Maximum users to return (1-50, default 10)."),
    },
    async (input) => {
      return handleFindUser(input, config);
    }
  );

  server.tool(
    "jira_get_edit_meta",
    "Return live editable fields for a specific issue, including field IDs, required flags, schema type, and allowed values.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
    },
    async (input) => {
      return handleGetEditMeta(input, config);
    }
  );

  server.tool(
    "jira_update_issue_fields",
    "Update fields on an existing Jira issue. Call jira_get_edit_meta first to discover which fields are editable. description supports Markdown-to-ADF via descriptionFormat.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      fields: z.record(z.unknown()).describe("Curated set of updateable Jira fields."),
      descriptionFormat: z
        .enum(["plain", "markdown", "adf"])
        .optional()
        .default("plain")
        .describe('How to interpret fields.description: "plain" (default, backward compat), "markdown" (converts Markdown to ADF), "adf" (pass-through ADF object).'),
    },
    async (input) => {
      return handleUpdateIssueFields(input, config);
    }
  );

  server.tool(
    "jira_validate_issue_update",
    "Validate a curated issue field update locally and against live Jira edit metadata. Does not write.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      fields: z.record(z.unknown()).describe("Curated set of updateable Jira fields to validate."),
    },
    async (input) => {
      return handleValidateIssueUpdate(input, config);
    }
  );

  server.tool(
    "jira_bulk_update_issue_fields",
    "Update fields on multiple issues. dryRun is required; only writes when dryRun=false.",
    {
      dryRun: z.boolean().describe("Required safety flag. true previews only; false applies updates."),
      issues: z
        .array(
          z.object({
            issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
            fields: z.record(z.unknown()).describe("Curated set of updateable Jira fields."),
          })
        )
        .min(1)
        .max(25),
    },
    async (input) => {
      return handleBulkUpdateIssueFields(input, config);
    }
  );

  server.tool(
    "jira_link_issues",
    "Create a Jira issue link between two issues, with an optional comment.",
    {
      inwardIssueKey: z.string().describe("Source/inward Jira issue key"),
      outwardIssueKey: z.string().describe("Target/outward Jira issue key"),
      linkType: z.string().describe("Jira issue link type name, e.g. Blocks"),
      comment: z.string().optional().describe("Optional link comment as plain text."),
    },
    async (input) => {
      return handleLinkIssues(input, config);
    }
  );

  server.tool(
    "jira_get_issue_links",
    "List issue links for one Jira issue, including direction, link type, linked issue key, summary, and status.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
    },
    async (input) => {
      return handleGetIssueLinks(input, config);
    }
  );

  server.tool(
    "jira_get_subtasks",
    "List subtasks for one Jira issue, including status, assignee, priority, and URL.",
    {
      issueKey: z.string().describe("Parent Jira issue key, e.g. PROJ-123"),
    },
    async (input) => {
      return handleGetSubtasks(input, config);
    }
  );

  server.tool(
    "jira_create_subtask",
    "Create a subtask under a parent issue. issueTypeId is explicit because subtask type IDs vary by Jira project.",
    {
      parentIssueKey: z.string().describe("Parent Jira issue key, e.g. PROJ-123"),
      issueTypeId: z.string().describe("Jira subtask issue type ID for this project."),
      fields: z.record(z.unknown()).describe("Jira create fields. parent and issuetype are injected."),
    },
    async (input) => {
      return handleCreateSubtask(input, config);
    }
  );

  server.tool(
    "jira_clone_issue",
    "Clone an issue by copying core fields, with optional summary prefix and field overrides.",
    {
      sourceIssueKey: z.string().describe("Source Jira issue key, e.g. PROJ-123"),
      summaryPrefix: z.string().optional().default("Clone of").describe("Prefix for cloned summary."),
      fields: z.record(z.unknown()).optional().describe("Optional field overrides for the cloned issue."),
    },
    async (input) => {
      return handleCloneIssue(input, config);
    }
  );

  server.tool(
    "jira_bulk_link_issues",
    "Create multiple issue links sequentially and return per-link success/error status.",
    {
      links: z
        .array(
          z.object({
            inwardIssueKey: z.string().describe("Source/inward Jira issue key"),
            outwardIssueKey: z.string().describe("Target/outward Jira issue key"),
            linkType: z.string().describe("Jira issue link type name, e.g. Blocks"),
            comment: z.string().optional().describe("Optional plain-text link comment."),
          })
        )
        .min(1)
        .max(25)
        .describe("Links to create, processed sequentially."),
    },
    async (input) => {
      return handleBulkLinkIssues(input, config);
    }
  );

  server.tool(
    "jira_bulk_transition_issues",
    "Transition multiple issues sequentially. dryRun is required; only writes when dryRun=false.",
    {
      dryRun: z.boolean().describe("Required safety flag. true resolves/previews only; false applies transitions."),
      issues: z
        .array(
          z.object({
            issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
            transitionId: z.string().optional().describe("Transition ID. Provide exactly one of transitionId or transitionName."),
            transitionName: z.string().optional().describe("Transition name. Provide exactly one of transitionId or transitionName."),
            comment: z.string().optional().describe("Optional transition comment as plain text."),
            fields: z.record(z.unknown()).optional().describe("Optional field updates sent with transition."),
          })
        )
        .min(1)
        .max(25),
    },
    async (input) => {
      return handleBulkTransitionIssues(input, config);
    }
  );

  server.tool(
    "jira_assign_issue",
    "Assign a Jira issue to a user. MUST provide at least one of assigneeName or assigneeKey. Use jira_find_user to discover the correct values.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      assigneeName: z.string().optional().describe("Jira username/name for assignment"),
      assigneeKey: z.string().optional().describe("Jira internal user key for assignment"),
    },
    async (input) => {
      return handleAssignIssue(input, config);
    }
  );

  server.tool(
    "jira_get_transitions",
    "List the currently available workflow transitions for a Jira issue.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
    },
    async (input) => {
      return handleGetTransitions(input, config);
    }
  );

  server.tool(
    "jira_get_my_worklogs",
    "List the authenticated user's Tempo worklogs for a date range. Both dates default to today if omitted.",
    {
      dateFrom: z.string().optional().describe("Start date in yyyy-MM-dd format (defaults to today)"),
      dateTo: z.string().optional().describe("End date in yyyy-MM-dd format (defaults to today)"),
    },
    async (input) => {
      return handleGetMyWorklogs(input, config);
    }
  );

  server.tool(
    "jira_update_comment",
    "Update an existing Jira issue comment. Supports Markdown-to-ADF conversion (default), plain text, or raw ADF.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      commentId: z.string().describe("Jira comment ID."),
      body: z.union([z.string(), z.record(z.unknown())]).describe("Replacement body as plain text, Markdown string, or ADF object."),
      bodyFormat: z
        .enum(["plain", "markdown", "adf"])
        .optional()
        .default("markdown")
        .describe('How to interpret body: "markdown" (default), "plain", or "adf".'),
    },
    async (input) => {
      return handleUpdateComment(input, config);
    }
  );

  server.tool(
    "jira_delete_comment",
    "Delete an existing Jira issue comment by ID.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      commentId: z.string().describe("Jira comment ID."),
    },
    async (input) => {
      return handleDeleteComment(input, config);
    }
  );

  server.tool(
    "jira_delete_issue",
    `Permanently delete a Jira issue. This action is IRREVERSIBLE.

When to use: only when the user explicitly asks to delete an issue.
Do NOT use for: closing, resolving, or archiving issues — use jira_transition_issue instead.

If the issue has subtasks, set deleteSubtasks=true or Jira will reject the request.`,
    {
      issueKey: z.string().describe("Jira issue key to delete, e.g. PROJ-123"),
      deleteSubtasks: z
        .boolean()
        .optional()
        .default(false)
        .describe("Also delete all subtasks. Default false — Jira rejects if issue has subtasks and this is false."),
    },
    async (input) => {
      return handleDeleteIssue(input, config);
    }
  );

  server.tool(
    "jira_update_worklog",
    "Update a Tempo worklog by ID. Supports date, duration, comment, and known Tempo attributes.",
    {
      worklogId: z.string().describe("Tempo worklog ID."),
      timeSpent: z.string().optional().describe('Duration string, e.g. "2h", "30m", "1d 4h".'),
      startDate: z.string().optional().describe("Date of work in yyyy-MM-dd format."),
      comment: z.string().optional().describe("Updated worklog comment."),
      process: z.string().optional().describe("Tempo Process attribute."),
      typeOfWork: z.string().optional().describe("Tempo Type Of Work attribute."),
    },
    async (input) => {
      return handleUpdateWorklog(input, config);
    }
  );

  server.tool(
    "jira_delete_worklog",
    "Delete a Tempo worklog by ID.",
    {
      worklogId: z.string().describe("Tempo worklog ID."),
    },
    async (input) => {
      return handleDeleteWorklog(input, config);
    }
  );

  server.tool(
    "jira_add_attachment",
    "Upload a local workspace file as a Jira issue attachment.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      filePath: z.string().describe("Path to a local file inside the current workspace."),
    },
    async (input) => {
      return handleAddAttachment(input, config);
    }
  );

  server.tool(
    "jira_upload_attachment_content",
    `Upload in-memory content as a Jira issue attachment — no local file needed.

Use this when you have the file content as a string (generated report, CSV, JSON, etc.) and want to attach it directly to an issue without saving to disk.

ENCODING:
- utf8 (default): content is a plain text string.
- base64: content is a base64-encoded string (use for binary files or when the content comes from a base64 source).

FILENAME must include a file extension (e.g. "report.md", "data.csv"). MIME type is inferred from the extension if not provided.

RETURNS: filename, size, MIME type, and attachment ID for each uploaded file.`,
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      filename: z
        .string()
        .describe("Attachment filename with extension, e.g. \"report.md\", \"data.csv\"."),
      content: z.string().describe("File content as a plain text string (utf8) or base64-encoded string."),
      encoding: z
        .enum(["utf8", "base64"])
        .optional()
        .default("utf8")
        .describe("Content encoding: utf8 (default) for plain text, base64 for binary/encoded content."),
      mimeType: z
        .string()
        .optional()
        .describe("Optional MIME type override, e.g. \"text/markdown\". Inferred from filename extension if omitted."),
    },
    async (input) => {
      return handleUploadAttachmentContent(input, config);
    }
  );

  server.tool(
    "jira_get_projects",
    "List Jira projects visible to the authenticated user.",
    {},
    async (input) => {
      return handleGetProjects(input, config);
    }
  );

  server.tool(
    "jira_get_components",
    "List components for a Jira project key.",
    {
      projectKey: z.string().describe("Jira project key, e.g. PROJ."),
    },
    async (input) => {
      return handleGetComponents(input, config);
    }
  );

  server.tool(
    "jira_get_priorities",
    "List Jira priorities configured in the Jira instance.",
    {},
    async (input) => {
      return handleGetPriorities(input, config);
    }
  );

  server.tool(
    "jira_get_audit_context",
    "Fetch one compact audit context containing issue details, links, subtasks, and optional comments.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      includeComments: z.boolean().optional().default(true).describe("Include recent comments, default true."),
      maxComments: z.number().int().min(1).max(100).optional().default(20).describe("Max comments when includeComments=true."),
    },
    async (input) => {
      return handleGetAuditContext(input, config);
    }
  );

  // Tool: jira_create_issue
  server.tool(
    "jira_create_issue",
    "Create a Jira issue. IMPORTANT: call jira_get_create_meta first to discover the required and allowed fields for the target project and issue type — required fields differ per project. Then pass those fields here.",
    {
      issueTypeId: z
        .nativeEnum(ISSUE_TYPE)
        .describe(
          "Jira issue type ID. Common values: Task=10000, Story=10101, Epic=10100, Bug=10202, Bug_Customer=10203, Improvement=10210, Change_Request=10206, Risk=10207, New_Feature=10211, QA=10205. Full list in src/jira/constants.ts ISSUE_TYPE."
        ),
      fields: z
        .record(z.unknown())
        .describe(
          "Jira create payload fields keyed by FIELD/CUSTOM_FIELD IDs. Do not include issuetype (injected from issueTypeId). Use jira_get_create_meta to discover required fields per project and issue type."
        ),
      descriptionFormat: z
        .enum(["plain", "markdown", "adf"])
        .optional()
        .default("plain")
        .describe('How to interpret fields.description: "plain" (default, backward compat), "markdown" (converts Markdown to ADF), "adf" (pass-through ADF object).'),
    },
    async (input) => {
      return handleCreateIssue(input, config);
    }
  );

  server.tool(
    "jira_preview_create_issue",
    "Build and validate a Jira create issue payload without sending it to Jira. Call jira_get_create_meta first to discover required fields.",
    {
      issueTypeId: z
        .nativeEnum(ISSUE_TYPE)
        .describe(
          "Jira issue type ID. Common values: Task=10000, Story=10101, Epic=10100, Bug=10202, Bug_Customer=10203, Improvement=10210, Change_Request=10206, Risk=10207, New_Feature=10211, QA=10205."
        ),
      fields: z
        .record(z.unknown())
        .describe("Jira create payload fields keyed by FIELD/CUSTOM_FIELD IDs."),
    },
    async (input) => {
      return handlePreviewCreateIssue(input);
    }
  );

  server.tool(
    "jira_preview_adf",
    `Preview how a body string will be converted to Jira Wiki Markup before sending to Jira Server. No session required — purely local conversion.

Use this to validate Markdown or inspect the Wiki Markup output before calling jira_add_comment, jira_update_comment, or jira_create_issue.

Returns: Jira Wiki Markup string, stats, and any conversion warnings.`,
    {
      body: z.string().describe("Body to convert: Markdown string or plain text."),
      bodyFormat: z
        .enum(["plain", "markdown"])
        .optional()
        .default("markdown")
        .describe('Format: "markdown" (default, converts to Jira Wiki Markup), "plain" (pass-through).'),
    },
    async (input) => {
      return handlePreviewAdf(input);
    }
  );

  server.tool(
    "jira_add_comments",
    `Add multiple comments to a Jira issue sequentially in a single call.

Each comment can have its own bodyFormat (markdown/plain). Comments are added in order.
On partial failure, returns success count and per-comment error details.

Useful for migration workflows that add multiple structured comments (e.g. [RAW], [VI], [ANALYSIS]) at once.`,
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      comments: z
        .array(
          z.object({
            body: z.string().describe("Comment body as Markdown string or plain text/Wiki Markup."),
            bodyFormat: z
              .enum(["plain", "markdown"])
              .optional()
              .default("markdown")
              .describe('Format: "markdown" (default, converts to Jira Wiki Markup), "plain" (pass-through).'),
          })
        )
        .min(1)
        .max(10)
        .describe("Comments to add sequentially (1–10)."),
      delayMs: z
        .number()
        .int()
        .min(0)
        .max(5000)
        .optional()
        .default(300)
        .describe("Delay in ms between sequential comment additions (0–5000, default 300). Increase if hitting Jira rate limits."),
    },
    async (input) => {
      return handleAddComments(input, config);
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Stdio transport — one server, one connection (stdin/stdout)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so stdout stays clean for MCP protocol
  process.stderr.write(`[jira-run-mcp] Started (stdio). Jira: ${config.JIRA_BASE_URL}\n`);
}

main().catch((err) => {
  process.stderr.write(`[jira-run-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
