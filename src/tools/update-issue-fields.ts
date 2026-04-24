import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import type { Config } from "../config.js";

export const updateIssueFieldsSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  fields: z.record(z.unknown()),
});

export async function handleUpdateIssueFields(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = updateIssueFieldsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

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

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const payload = buildUpdateIssuePayload(parsed.data.fields);
    await client.updateIssueFields(parsed.data.issueKey, payload);

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Issue updated**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${parsed.data.issueKey} |`,
            `| **Updated Fields** | ${Object.keys(payload.fields).join(", ")} |`,
            `| **URL** | ${cfg.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${parsed.data.issueKey} |`,
          ].join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) {
      return errorContent(`[${err.code}] ${err.message}`);
    }
    if (err instanceof Error) {
      return errorContent(err.message);
    }
    throw err;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `[${code}] ${message}` }],
  };
}
