import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const getEditMetaSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/, "issueKey must be a valid Jira key"),
});

export async function handleGetEditMeta(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getEditMetaSchema.safeParse(rawInput);
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
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const meta = await client.getEditMeta(parsed.data.issueKey);
    const lines = [`# Editable Fields`, "", `**Issue:** ${meta.issueKey}`, ""];

    if (meta.fields.length === 0) {
      lines.push("_No editable fields returned by Jira._");
    } else {
      lines.push(`| Field ID | Name | Required | Type | Allowed Values |`);
      lines.push(`|---|---|---|---|---|`);
      for (const field of meta.fields) {
        const allowedValues = field.allowedValues
          .map((value) => value.name ?? value.value ?? value.id ?? "")
          .filter(Boolean)
          .slice(0, 10)
          .join(", ");
        lines.push(
          `| ${field.id} | ${field.name} | ${field.required ? "yes" : "no"} | ${field.schemaType ?? "—"} | ${allowedValues || "—"} |`
        );
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
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
