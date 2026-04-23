import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  TEMPO_WORK_ATTRIBUTE,
  TEMPO_PROCESS,
  TEMPO_TYPE_OF_WORK,
} from "../jira/constants.js";
import { isMcpError, McpError } from "../errors.js";
import type { Config } from "../config.js";
import type { TempoWorkAttributeValue } from "../types.js";

// ---------------------------------------------------------------------------
// Duration parser
// ---------------------------------------------------------------------------

/**
 * Converts a human-readable duration string into seconds.
 *
 * Supported tokens:
 *  - `Nd` — days (1 day = 8 hours)
 *  - `Nh` — hours
 *  - `Nm` — minutes
 *
 * Examples:
 *  - `"2h"`       → 7200
 *  - `"30m"`      → 1800
 *  - `"1d"`       → 28800
 *  - `"1d 2h 30m"` → 37800
 */
export function parseDuration(input: string): number {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    throw new McpError("INVALID_INPUT", "Duration string is empty");
  }

  const pattern = /(\d+(?:\.\d+)?)\s*(d|h|m)/g;
  let totalSeconds = 0;
  let matched = false;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    matched = true;
    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case "d":
        totalSeconds += value * 8 * 3600; // 1d = 8h
        break;
      case "h":
        totalSeconds += value * 3600;
        break;
      case "m":
        totalSeconds += value * 60;
        break;
    }
  }

  if (!matched) {
    throw new McpError(
      "INVALID_INPUT",
      `Invalid duration format: "${input}". Use combinations of Nd, Nh, Nm (e.g. "2h 30m", "1d 4h").`
    );
  }

  if (totalSeconds <= 0) {
    throw new McpError("INVALID_INPUT", "Duration must be greater than zero");
  }

  return Math.round(totalSeconds);
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const addWorklogSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(
      /^[A-Z][A-Z0-9_]+-\d+$/,
      "issueKey must be a valid Jira key (e.g. PROJ-123)"
    ),
  timeSpent: z
    .string()
    .min(1, "timeSpent is required")
    .describe(
      'Duration string: use Nd (days=8h), Nh (hours), Nm (minutes). Examples: "2h", "1d 4h 30m".'
    ),
  startDate: z
    .string()
    .regex(DATE_REGEX, "startDate must be in yyyy-MM-dd format"),
  comment: z
    .string()
    .optional()
    .describe("Description of work performed"),
  process: z
    .enum(TEMPO_PROCESS)
    .optional()
    .describe(
      `Tempo Process attribute. Values: ${TEMPO_PROCESS.join(", ")}`
    ),
  typeOfWork: z
    .enum(TEMPO_TYPE_OF_WORK)
    .optional()
    .describe(
      `Tempo Type Of Work attribute. Values: ${TEMPO_TYPE_OF_WORK.join(", ")}`
    ),
  includeNonWorkingDays: z
    .boolean()
    .default(false)
    .describe("Include weekends/holidays (default false)"),
});

export type AddWorklogInput = z.infer<typeof addWorklogSchema>;

// ---------------------------------------------------------------------------
// MCP content type
// ---------------------------------------------------------------------------

interface TextContent {
  type: "text";
  text: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * MCP tool handler for `jira_add_worklog`.
 *
 * 1. Validates input
 * 2. Loads session & creates HTTP client
 * 3. Fetches current user key via GET /rest/api/2/myself
 * 4. Parses duration string → seconds
 * 5. Builds Tempo work attributes (Process, TypeOfWork)
 * 6. POST worklog to Tempo
 * 7. Returns formatted markdown
 */
export async function handleAddWorklog(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: TextContent[]; isError?: boolean }> {
  const parsed = addWorklogSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const {
    issueKey,
    timeSpent,
    startDate,
    comment,
    process,
    typeOfWork,
    includeNonWorkingDays,
  } = parsed.data;

  // --- Parse duration ---
  let timeSpentSeconds: number;
  try {
    timeSpentSeconds = parseDuration(timeSpent);
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(err.message);
    }
    throw err;
  }

  // --- Load session ---
  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return authErrorContent(err.code, err.message);
    }
    throw err;
  }

  const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);

  try {
    // --- Get current user key ---
    const currentUser = await client.getCurrentUser();

    // --- Build work attributes ---
    const attributes: Record<string, TempoWorkAttributeValue> = {};
    if (process) {
      const attr = TEMPO_WORK_ATTRIBUTE.PROCESS;
      attributes[attr.key] = {
        name: attr.name,
        workAttributeId: attr.id,
        value: process,
      };
    }
    if (typeOfWork) {
      const attr = TEMPO_WORK_ATTRIBUTE.TYPE_OF_WORK;
      attributes[attr.key] = {
        name: attr.name,
        workAttributeId: attr.id,
        value: typeOfWork,
      };
    }

    // --- Compute remaining estimate ---
    // Fetch current remaining, subtract this worklog, clamp to 0
    const currentRemaining = await client.getIssueRemainingEstimate(issueKey);
    const newRemaining = Math.max(0, currentRemaining - timeSpentSeconds);

    // --- Create worklog ---
    const worklogs = await client.createWorklog({
      worker: currentUser.key,
      originTaskId: issueKey,
      started: startDate,
      timeSpentSeconds,
      comment,
      originId: -1,
      remainingEstimate: newRemaining,
      billableSeconds: "",
      endDate: null,
      includeNonWorkingDays,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    });

    if (worklogs.length === 0) {
      return errorContent("Tempo returned an empty worklogs array.");
    }

    const wl = worklogs[0];
    return {
      content: [
        {
          type: "text",
          text: formatWorklogResult(
            wl,
            currentUser.displayName,
            process,
            typeOfWork
          ),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatWorklogResult(
  wl: {
    tempoWorklogId: number;
    jiraWorklogId: number | null;
    timeSpentSeconds: number;
    timeSpent: string;
    startDate: string;
    comment: string | null;
    issue: { key: string; summary: string; projectKey: string };
  },
  displayName: string,
  process?: string,
  typeOfWork?: string
): string {
  const lines: string[] = [];

  lines.push(`✅ **Worklog created successfully**`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Issue** | ${wl.issue.key}: ${wl.issue.summary} |`);
  lines.push(`| **Project** | ${wl.issue.projectKey} |`);
  lines.push(`| **Worker** | ${displayName} |`);
  lines.push(`| **Date** | ${wl.startDate} |`);
  lines.push(
    `| **Duration** | ${wl.timeSpent} (${wl.timeSpentSeconds}s) |`
  );
  if (wl.comment) {
    lines.push(`| **Comment** | ${wl.comment} |`);
  }
  if (process) {
    lines.push(`| **Process** | ${process} |`);
  }
  if (typeOfWork) {
    lines.push(`| **Type Of Work** | ${typeOfWork} |`);
  }
  lines.push(`| **Tempo ID** | ${wl.tempoWorklogId} |`);
  if (wl.jiraWorklogId) {
    lines.push(`| **Jira Worklog ID** | ${wl.jiraWorklogId} |`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `[${code}] ${message}\n\nRun: npm run jira-auth-login`,
      },
    ],
  };
}
