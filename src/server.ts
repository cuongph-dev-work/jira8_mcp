import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config.js";
import { ISSUE_TYPE } from "./jira/constants.js";
import { handleCreateIssue } from "./tools/create-issue.js";
import { handleGetIssue } from "./tools/get-issue.js";
import { handleSearchIssues } from "./tools/search-issues.js";

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
