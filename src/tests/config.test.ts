import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test config validation by manipulating process.env
// and re-importing the module via dynamic import.

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
    expect(config.JIRA_SESSION_FILE).toBe(".jira/session.json");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.PLAYWRIGHT_HEADLESS).toBe(false);
    expect(config.PLAYWRIGHT_BROWSER).toBe("chromium");
  });

  it("accepts overridden values", async () => {
    process.env.JIRA_BASE_URL = "https://jira.corp.net";
    process.env.PLAYWRIGHT_HEADLESS = "true";
    process.env.PLAYWRIGHT_BROWSER = "firefox";
    process.env.LOG_LEVEL = "debug";

    const { config } = await import("../config.js");

    expect(config.PLAYWRIGHT_HEADLESS).toBe(true);
    expect(config.PLAYWRIGHT_BROWSER).toBe("firefox");
    expect(config.LOG_LEVEL).toBe("debug");
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
});
