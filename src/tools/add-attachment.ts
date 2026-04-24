import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { invalidInput, isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const addAttachmentSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key"),
  filePath: z.string().min(1, "filePath is required"),
});

export async function handleAddAttachment(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = addAttachmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  let filePath: string;
  try {
    filePath = resolveWorkspaceFilePath(parsed.data.filePath, cfg.ATTACHMENT_WORKSPACE);
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    throw err;
  }

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
    const attachments = await client.addAttachment(parsed.data.issueKey, filePath);
    const lines = [`✅ **Attachment uploaded**`, "", `| File | Size | Attachment ID |`, `|---|---|---|`];
    for (const attachment of attachments) {
      lines.push(`| ${attachment.filename} | ${attachment.size} | ${attachment.id} |`);
    }
    lines.push("", `**Issue:** ${cfg.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${parsed.data.issueKey}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

function resolveWorkspaceFilePath(filePath: string, workspaceRoot: string): string {
  const resolvedPath = resolve(filePath);
  const relativePath = relative(workspaceRoot, resolvedPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw invalidInput(`Attachment file must be inside workspace: ${workspaceRoot}`);
  }

  return resolvedPath;
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
