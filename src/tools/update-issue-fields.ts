import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { buildUpdateIssuePayload } from "../jira/update-issue.js";
import { normalizeJiraBody } from "../jira/body-normalizer.js";
import { navigationHint } from "../utils.js";
import { FIELD } from "../jira/constants.js";
import type { Config } from "../config.js";

export const updateIssueFieldsSchema = z.object({
  issueKey: z
    .string()
    .min(1, "issueKey is required")
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key (e.g. PROJ-123)"),
  fields: z.record(z.unknown()),
  descriptionFormat: z
    .enum(["plain", "markdown"])
    .optional()
    .default("plain")
    .describe(
      'How to interpret fields.description: "plain" (default, pass-through string/Wiki Markup), "markdown" (converts Markdown to Jira Wiki Markup).'
    ),
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
  const { issueKey, fields, descriptionFormat } = parsed.data;

  // Normalize description if format is not plain (tool layer handles conversion)
  const normalizedFields = { ...fields };
  const rawDescription = normalizedFields[FIELD.DESCRIPTION];
  if (rawDescription != null && descriptionFormat !== "plain") {
    try {
      normalizedFields[FIELD.DESCRIPTION] = normalizeJiraBody(
        rawDescription as string,
        descriptionFormat
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorContent(`description conversion failed: ${msg}`);
    }
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const payload = buildUpdateIssuePayload(normalizedFields);
    await client.updateIssueFields(issueKey, payload);

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Issue updated**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Issue** | ${issueKey} |`,
            `| **Updated Fields** | ${Object.keys(payload.fields).join(", ")} |`,
            `| **URL** | ${cfg.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${issueKey} |`,
          ].join("\n") + navigationHint(
            `\`jira_get_issue({issueKey: "${issueKey}"})\` to verify the updated fields`,
          ),
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
