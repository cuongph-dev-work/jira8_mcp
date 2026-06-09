import { defaultSessionDir, defaultDownloadsDir } from "./bootstrap.js";
import { join } from "path";
import { z } from "zod";
import { configError } from "./errors.js";

// ---------------------------------------------------------------------------
// Schema — only user-facing variables are read from the environment.
// Internal/infra settings are hardcoded below.
// ---------------------------------------------------------------------------

const schema = z.object({
  JIRA_BASE_URL: z
    .string()
    .url("JIRA_BASE_URL must be a valid URL (e.g. https://jira.yourcompany.com)"),

  JIRA_EMAIL: z.string().optional(),
  JIRA_PASSWORD: z.string().optional(),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

// ---------------------------------------------------------------------------
// Hardcoded defaults — not configurable via .env
// ---------------------------------------------------------------------------

const DEFAULTS = {
  JIRA_SESSION_FILE: join(defaultSessionDir, "session.json"), // absolute path
  JIRA_VALIDATE_PATH: "/rest/api/2/myself",
  ATTACHMENT_WORKSPACE: defaultDownloadsDir,                   // absolute path
  PLAYWRIGHT_HEADLESS: false,
  PLAYWRIGHT_BROWSER: "chromium" as const,
} as const;

export type Config = z.infer<typeof schema> & typeof DEFAULTS;

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
  return { ...DEFAULTS, ...result.data };
}

export const config: Config = loadConfig();
