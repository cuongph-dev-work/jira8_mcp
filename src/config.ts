import { defaultSessionDir, defaultDownloadsDir } from "./bootstrap.js";
import { join } from "path";
import { z } from "zod";
import { configError } from "./errors.js";

const nonEmptyStringOptional = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(1).optional());

// ---------------------------------------------------------------------------
// Schema — only user-facing variables are read from the environment.
// Internal/infra settings are hardcoded below.
// ---------------------------------------------------------------------------

const schema = z.object({
  JIRA_BASE_URL: z
    .string()
    .url("JIRA_BASE_URL must be a valid URL (e.g. https://jira.yourcompany.com)"),

  JIRA_EMAIL: nonEmptyStringOptional,
  JIRA_PASSWORD: nonEmptyStringOptional,

  /** GitLab personal access token (required by jira_sync_gitlab_review_defects). */
  GITLAB_TOKEN: nonEmptyStringOptional,
  GITLAB_PROJECTS_JSON: nonEmptyStringOptional,
  GITLAB_PROJECTS_FILE: nonEmptyStringOptional,
  GITLAB_DEDUP_FILE: nonEmptyStringOptional,

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
}).superRefine((values, ctx) => {
  const hasEmail = values.JIRA_EMAIL !== undefined;
  const hasPassword = values.JIRA_PASSWORD !== undefined;
  if (hasEmail !== hasPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasEmail ? "JIRA_PASSWORD" : "JIRA_EMAIL"],
      message: "JIRA_EMAIL and JIRA_PASSWORD must be configured together",
    });
  }
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
  return {
    ...DEFAULTS,
    ...result.data,
    GITLAB_PROJECTS_FILE:
      result.data.GITLAB_PROJECTS_FILE ?? join(defaultSessionDir, "gitlab-projects.json"),
    GITLAB_DEDUP_FILE:
      result.data.GITLAB_DEDUP_FILE ?? join(defaultSessionDir, "gitlab-review-defects.json"),
  };
}

export const config: Config = loadConfig();
