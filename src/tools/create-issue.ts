import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import {
  FIELD,
  ISSUE_TYPE,
  type IssueTypeId,
} from "../jira/constants.js";
import {
  buildCreateIssuePayload,
  buildCreateIssueResult,
} from "../jira/create-issue.js";
import { normalizeJiraBody } from "../jira/adf.js";
import type { Config } from "../config.js";

export const createIssueSchema = z.object({
  issueTypeId: z.nativeEnum(ISSUE_TYPE),
  fields: z
    .record(z.unknown())
    .describe("Jira fields keyed by standard field names or customfield IDs."),
  descriptionFormat: z
    .enum(["plain", "markdown", "adf"])
    .optional()
    .default("plain")
    .describe(
      "How to interpret the description field: \"plain\" (default, keeps backward compat), \"markdown\" (converts Markdown to ADF), \"adf\" (pass-through ADF object)."
    ),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export async function handleCreateIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = createIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueTypeId, fields, descriptionFormat } = parsed.data as {
    issueTypeId: IssueTypeId;
    fields: Record<string, unknown>;
    descriptionFormat: "plain" | "markdown" | "adf";
  };

  // Normalize description field if present
  const normalizedFields = { ...fields };
  const rawDescription = normalizedFields[FIELD.DESCRIPTION];
  if (rawDescription != null) {
    if (descriptionFormat === "plain" && typeof rawDescription !== "string") {
      return errorContent("description must be a plain text string when descriptionFormat is \"plain\".");
    }
    if (descriptionFormat !== "plain") {
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
    const payload = buildCreateIssuePayload(issueTypeId, normalizedFields);
    const created = await client.createIssue(payload);
    const rawSummary = normalizedFields[FIELD.SUMMARY];
    const summary = typeof rawSummary === "string" ? rawSummary : "";
    const result = buildCreateIssueResult(cfg.JIRA_BASE_URL, created, issueTypeId, summary);

    return {
      content: [
        {
          type: "text",
          text: formatCreatedIssue(result),
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

function formatCreatedIssue(issue: {
  key: string;
  url: string;
  summary: string;
  issueType: string;
}): string {
  return [
    `# Created issue ${issue.key}`,
    "",
    `**Summary:** ${issue.summary}`,
    `**Type:** ${issue.issueType}`,
    `**URL:** ${issue.url}`,
  ].join("\n");
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
