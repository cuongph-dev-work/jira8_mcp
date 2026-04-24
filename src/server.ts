import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config.js";
import { ISSUE_TYPE } from "./jira/constants.js";
import { handleAddComment } from "./tools/add-comment.js";
import { handleAddAttachment } from "./tools/add-attachment.js";
import { handleAssignIssue } from "./tools/assign-issue.js";
import { handleBulkLinkIssues } from "./tools/bulk-link-issues.js";
import { handleBulkTransitionIssues } from "./tools/bulk-transition-issues.js";
import { handleBulkUpdateIssueFields } from "./tools/bulk-update-issue-fields.js";
import { handleCloneIssue } from "./tools/clone-issue.js";
import { handleCreateIssue } from "./tools/create-issue.js";
import { handleCreateSubtask } from "./tools/create-subtask.js";
import { handleDeleteComment } from "./tools/delete-comment.js";
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
import { handleTransitionIssue } from "./tools/transition-issue.js";
import { handleUpdateComment } from "./tools/update-comment.js";
import { handleUpdateIssueFields } from "./tools/update-issue-fields.js";
import { handleUpdateWorklog } from "./tools/update-worklog.js";
import { handleValidateIssueUpdate } from "./tools/validate-issue-update.js";
import { handleAddWorklog } from "./tools/add-worklog.js";

// ---------------------------------------------------------------------------
// MCP server factory
// A new McpServer is created per request (stateless Streamable HTTP pattern).
// Calling server.connect() on a single shared instance across concurrent
// requests causes lifecycle conflicts — each transport must own its server.
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
    "Add a comment to a Jira issue. Accepts plain text (auto-converted to ADF).",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      body: z.string().describe("Comment body as plain text."),
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
    "Update a curated set of issue fields on an existing Jira issue. Description supports plain text or raw ADF.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      fields: z.record(z.unknown()).describe("Curated set of updateable Jira fields."),
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
            comment: z.union([z.string(), z.record(z.unknown())]).optional().describe("Optional transition comment."),
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
    "Assign a Jira issue to a user by assigneeName or assigneeKey.",
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
    "Update an existing Jira issue comment. Body accepts plain text or raw ADF JSON.",
    {
      issueKey: z.string().describe("Jira issue key, e.g. PROJ-123"),
      commentId: z.string().describe("Jira comment ID."),
      body: z.string().describe("Replacement comment body as plain text."),
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
    "Create a Jira issue for a specific issue type using required and optional fields defined in src/jira/constants.ts.",
    {
      issueTypeId: z
        .nativeEnum(ISSUE_TYPE)
        .describe("Jira issue type ID from src/jira/constants.ts, e.g. 10000 for Task."),
      fields: z
        .record(z.unknown())
        .describe("Jira create payload fields keyed by FIELD/CUSTOM_FIELD IDs. Do not include issuetype; it is injected from issueTypeId."),
    },
    async (input) => {
      return handleCreateIssue(input, config);
    }
  );

  server.tool(
    "jira_preview_create_issue",
    "Build and validate a Jira create issue payload without sending it to Jira.",
    {
      issueTypeId: z
        .nativeEnum(ISSUE_TYPE)
        .describe("Jira issue type ID from src/jira/constants.ts."),
      fields: z
        .record(z.unknown())
        .describe("Jira create payload fields keyed by FIELD/CUSTOM_FIELD IDs."),
    },
    async (input) => {
      return handlePreviewCreateIssue(input);
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Express + Streamable HTTP transport
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

/**
 * MCP endpoint — stateless, per-request server+transport pair.
 *
 * Each incoming request gets a brand-new McpServer and StreamableHTTPServerTransport.
 * This is the correct pattern for stateless Streamable HTTP:
 * - No shared mutable transport state between concurrent requests.
 * - server.connect() is called exactly once per server instance.
 */
app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session header
  });

  res.on("close", () => {
    transport.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[MCP] Request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "jira-run-mcp", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(config.MCP_PORT, () => {
  console.log(`\n🚀 Jira MCP server running`);
  console.log(`   Port     : ${config.MCP_PORT}`);
  console.log(`   Endpoint : http://localhost:${config.MCP_PORT}/mcp`);
  console.log(`   Health   : http://localhost:${config.MCP_PORT}/health`);
  console.log(`   Jira     : ${config.JIRA_BASE_URL}\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n⏹  Shutting down...");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("\n⏹  Shutting down...");
  process.exit(0);
});
