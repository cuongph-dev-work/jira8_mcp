import { z } from "zod";
import { configError } from "./errors.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  JIRA_BASE_URL: z
    .string()
    .url("JIRA_BASE_URL must be a valid URL (e.g. https://jira.yourcompany.com)"),

  JIRA_VALIDATE_PATH: z
    .string()
    .default("/rest/api/2/myself"),

  JIRA_SESSION_FILE: z
    .string()
    .default(".jira/session.json"),

  MCP_PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  PLAYWRIGHT_HEADLESS: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),

  PLAYWRIGHT_BROWSER: z
    .enum(["chromium", "firefox", "webkit"])
    .default("chromium"),

  ATTACHMENT_WORKSPACE: z
    .string()
    .default("./downloads")
    .describe("Directory where downloaded attachments are saved (created if missing)"),
});

export type Config = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Parse once at startup — callers import `config` directly
// ---------------------------------------------------------------------------

function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw configError(`Invalid configuration:\n${messages}`, result.error);
  }
  return result.data;
}

export const config: Config = loadConfig();
