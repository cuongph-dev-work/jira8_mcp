import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { normalizeAdfValue } from "../jira/adf.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const linkIssuesSchema = z.object({
  inwardIssueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "inwardIssueKey must be a valid Jira key"),
  outwardIssueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "outwardIssueKey must be a valid Jira key"),
  linkType: z.string().min(1, "linkType is required"),
  comment: z.union([z.string(), z.record(z.unknown())]).optional(),
});

export async function handleLinkIssues(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = linkIssuesSchema.safeParse(rawInput);
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
    const payload: {
      type: { name: string };
      inwardIssue: { key: string };
      outwardIssue: { key: string };
      comment?: { body: unknown };
    } = {
      type: { name: parsed.data.linkType },
      inwardIssue: { key: parsed.data.inwardIssueKey },
      outwardIssue: { key: parsed.data.outwardIssueKey },
    };
    if (parsed.data.comment !== undefined) {
      payload.comment = { body: normalizeAdfValue(parsed.data.comment) };
    }

    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const result = await client.linkIssues(payload);
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Link created**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Inward Issue** | ${parsed.data.inwardIssueKey} |`,
            `| **Outward Issue** | ${parsed.data.outwardIssueKey} |`,
            `| **Link Type** | ${parsed.data.linkType} |`,
            `| **Link ID** | ${result.linkId} |`,
          ].join("\n"),
        },
      ],
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
