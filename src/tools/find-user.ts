import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError } from "../errors.js";
import { JiraHttpClient } from "../jira/http-client.js";
import type { Config } from "../config.js";

export const findUserSchema = z.object({
  query: z.string().min(1, "query is required"),
  maxResults: z.number().int().min(1).max(50).optional().default(10),
});

export async function handleFindUser(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = findUserSchema.safeParse(rawInput);
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
    const users = await client.findUsers(parsed.data.query, parsed.data.maxResults);
    const lines = [`# Jira Users`, "", `**Query:** ${parsed.data.query}`, ""];

    if (users.length === 0) {
      lines.push("_No users found._");
    } else {
      lines.push(`| Display Name | Name | Key | Active | Email |`);
      lines.push(`|---|---|---|---|---|`);
      for (const user of users) {
        lines.push(
          `| ${user.displayName} | ${user.name ?? "—"} | ${user.key ?? "—"} | ${formatNullableBoolean(user.active)} | ${user.emailAddress ?? "—"} |`
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

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "yes" : "no";
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
