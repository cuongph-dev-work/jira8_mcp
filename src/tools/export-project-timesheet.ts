import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const exportProjectTimesheetSchema = z.object({
  projectKey: z
    .string()
    .min(1, "projectKey is required")
    .describe("Jira project key, e.g. PROJ"),
  dateFrom: z
    .string()
    .regex(DATE_REGEX, "dateFrom must be in yyyy-MM-dd format")
    .describe("Start of date range (yyyy-MM-dd), e.g. 2026-04-01"),
  dateTo: z
    .string()
    .regex(DATE_REGEX, "dateTo must be in yyyy-MM-dd format")
    .describe("End of date range inclusive (yyyy-MM-dd), e.g. 2026-04-30"),
  format: z
    .enum(["xlsx", "xls", "csv"])
    .optional()
    .default("xlsx")
    .describe(
      "Requested export format (default xlsx). xlsx is sent to Tempo as ooxml; actual file extension is confirmed from the server response"
    ),
});

export type ExportProjectTimesheetInput = z.infer<typeof exportProjectTimesheetSchema>;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleExportProjectTimesheet(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const parsed = exportProjectTimesheetSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { projectKey, dateFrom, dateTo, format } = parsed.data;

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const title = await resolveTitle(client, projectKey);
    const file = await client.exportProjectTimesheet({ dateFrom, dateTo, projectKey, title, format });

    const ext = resolveExtension(file.contentDisposition, file.contentType, format);
    const filename = `timesheet_${projectKey}_${dateFrom}_to_${dateTo}_${Date.now()}.${ext}`;
    await mkdir(cfg.ATTACHMENT_WORKSPACE, { recursive: true });
    const fullPath = join(cfg.ATTACHMENT_WORKSPACE, filename);
    await writeFile(fullPath, file.buffer);

    const text = formatResult({ projectKey, dateFrom, dateTo, ext, fullPath, size: file.buffer.length });
    return { content: [{ type: "text" as const, text }] };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      const detail =
        err.details === undefined
          ? ""
          : `\nDetails: ${typeof err.details === "string" ? err.details : JSON.stringify(err.details)}`;
      return errorContent(`[${err.code}] ${err.message}${detail}`);
    }
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Never fails the export just because a pretty project title couldn't be resolved. */
async function resolveTitle(client: JiraHttpClient, projectKey: string): Promise<string> {
  try {
    const projects = await client.getProjects();
    const project = projects.find((p) => p.key === projectKey);
    if (project) return `Project: ${project.name} (${project.key})`;
  } catch {
    // fall through to generic title
  }
  return `Project: ${projectKey}`;
}

function resolveExtension(
  contentDisposition: string | undefined,
  contentType: string | undefined,
  requestedFormat: string
): string {
  if (contentDisposition) {
    const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
    if (match) {
      const dotIndex = match[1].lastIndexOf(".");
      if (dotIndex !== -1 && dotIndex < match[1].length - 1) {
        return match[1].slice(dotIndex + 1).toLowerCase();
      }
    }
  }
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase();
    if (EXTENSION_BY_CONTENT_TYPE[base]) return EXTENSION_BY_CONTENT_TYPE[base];
  }
  return requestedFormat;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatResult(input: {
  projectKey: string;
  dateFrom: string;
  dateTo: string;
  ext: string;
  fullPath: string;
  size: number;
}): string {
  const lines = [
    `# 📊 Project Timesheet Exported`,
    "",
    `**Project:** ${input.projectKey}`,
    `**Period:** ${input.dateFrom} → ${input.dateTo}`,
    `**Format:** ${input.ext}`,
    `**File:** ${input.fullPath}`,
    `**Size:** ${fmtSize(input.size)}`,
  ];
  lines.push(
    navigationHint(
      `\`jira_upload_attachment_content({issueKey: "<key>", filename: "${input.fullPath.split("/").pop()}", content: "<base64>", encoding: "base64"})\` to attach this file to a Jira issue`
    )
  );
  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `[${code}] ${message}\n\nRun: npm run jira-auth-login` }],
  };
}
