import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test config validation by manipulating process.env
// and re-importing the module via dynamic import.

vi.mock("dotenv", () => ({ config: vi.fn() }));

describe("config", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("parses valid configuration with defaults applied", async () => {
    process.env.JIRA_BASE_URL = "https://jira.example.com";
    const { config } = await import("../config.js");

    expect(config.JIRA_BASE_URL).toBe("https://jira.example.com");
    expect(config.JIRA_VALIDATE_PATH).toBe("/rest/api/2/myself");
    expect(config.JIRA_SESSION_FILE).toMatch(/[\\/]\.jira[\\/]session\.json$/);
    expect(config.GITLAB_PROJECTS_FILE).toMatch(/[\\/]\.jira[\\/]gitlab-projects\.json$/);
    expect(config.GITLAB_DEDUP_FILE).toMatch(/[\\/]\.jira[\\/]gitlab-review-defects\.json$/);
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.PLAYWRIGHT_HEADLESS).toBe(false);
    expect(config.PLAYWRIGHT_BROWSER).toBe("chromium");
  });

  it("accepts overridden values", async () => {
    process.env.JIRA_BASE_URL = "https://jira.corp.net";
    process.env.LOG_LEVEL = "debug";
    // PLAYWRIGHT_HEADLESS and PLAYWRIGHT_BROWSER are hardcoded defaults now,
    // so setting them in env should not change them.
    process.env.PLAYWRIGHT_HEADLESS = "true";
    process.env.PLAYWRIGHT_BROWSER = "firefox";
    process.env.GITLAB_PROJECTS_FILE = "/tmp/custom-gitlab-projects.json";
    process.env.GITLAB_DEDUP_FILE = "/tmp/custom-gitlab-dedup.json";

    const { config } = await import("../config.js");

    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.GITLAB_PROJECTS_JSON).toBeUndefined();
    expect(config.GITLAB_PROJECTS_FILE).toBe("/tmp/custom-gitlab-projects.json");
    expect(config.GITLAB_DEDUP_FILE).toBe("/tmp/custom-gitlab-dedup.json");
    expect(config.PLAYWRIGHT_HEADLESS).toBe(false); // Should remain default
    expect(config.PLAYWRIGHT_BROWSER).toBe("chromium"); // Should remain default
  });

  it("throws CONFIG_ERROR when JIRA_BASE_URL is missing", async () => {
    delete process.env.JIRA_BASE_URL;

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });

  it("throws CONFIG_ERROR when JIRA_BASE_URL is not a valid URL", async () => {
    process.env.JIRA_BASE_URL = "not-a-url";

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });


  it("accepts optional JIRA_EMAIL and JIRA_PASSWORD", async () => {
    process.env.JIRA_BASE_URL = "https://jira.example.com";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const { config } = await import("../config.js");

    expect(config.JIRA_EMAIL).toBe("user@example.com");
    expect(config.JIRA_PASSWORD).toBe("secret");
  });

  it("rejects partial Jira credentials", async () => {
    process.env.JIRA_BASE_URL = "https://jira.example.com";
    process.env.JIRA_EMAIL = "user@example.com";
    delete process.env.JIRA_PASSWORD;

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });

  it("treats empty GitLab env strings as unset", async () => {
    process.env.JIRA_BASE_URL = "https://jira.example.com";
    process.env.GITLAB_PROJECTS_JSON = "   ";
    process.env.GITLAB_PROJECTS_FILE = "";
    process.env.GITLAB_DEDUP_FILE = " ";

    const { config } = await import("../config.js");

    expect(config.GITLAB_PROJECTS_JSON).toBeUndefined();
    expect(config.GITLAB_PROJECTS_FILE).toMatch(/[\\/]\.jira[\\/]gitlab-projects\.json$/);
    expect(config.GITLAB_DEDUP_FILE).toMatch(/[\\/]\.jira[\\/]gitlab-review-defects\.json$/);
  });
});
