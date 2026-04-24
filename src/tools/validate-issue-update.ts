import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";

export const validateIssueUpdateSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  fields: z.record(z.unknown()),
});

export async function handleValidateIssueUpdate(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = validateIssueUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  let payload;
  try {
    payload = buildUpdateIssuePayload(parsed.data.fields);
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
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
    const meta = await client.getEditMeta(parsed.data.issueKey);
    const editable = new Set(meta.fields.map((field) => field.id));
    const requestedFields = Object.keys(payload.fields);
    const nonEditable = requestedFields.filter((fieldId) => !editable.has(fieldId));
    const status = nonEditable.length === 0 ? "VALID" : "INVALID";

    return {
      content: [
        {
          type: "text",
          text: [
            `# Issue update validation`,
            "",
            `**Issue:** ${parsed.data.issueKey}`,
            `**Status:** ${status}`,
            `**Requested Fields:** ${requestedFields.join(", ") || "—"}`,
            `**Non-editable Fields:** ${nonEditable.join(", ") || "—"}`,
            "",
            "```json",
            JSON.stringify(payload, null, 2),
            "```",
          ].join("\n"),
        },
      ],
      ...(nonEditable.length > 0 ? { isError: true as const } : {}),
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
