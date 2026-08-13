import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractCookies } from "../auth/session-manager.js";
import type { SessionFile } from "../types.js";

const BASE_URL = "https://jira.example.com";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(cookies: Array<{ name: string; value: string; domain: string }>): SessionFile {
  return {
    savedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    storageState: {
      cookies: cookies.map((c) => ({
        ...c,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax" as const,
      })),
      origins: [],
    },
  };
}

// ---------------------------------------------------------------------------
// extractCookies
// ---------------------------------------------------------------------------

describe("extractCookies", () => {
  it("extracts cookies matching the base URL domain", () => {
    const session = makeSession([
      { name: "JSESSIONID", value: "abc123", domain: "jira.example.com" },
      { name: "crowd.token_key", value: "xyz789", domain: "jira.example.com" },
    ]);

    const result = extractCookies(session, BASE_URL);
    expect(result.cookieHeader).toContain("JSESSIONID=abc123");
    expect(result.cookieHeader).toContain("crowd.token_key=xyz789");
  });

  it("excludes cookies from a different domain", () => {
    const session = makeSession([
      { name: "JSESSIONID", value: "abc123", domain: "jira.example.com" },
      { name: "other", value: "nope", domain: "other.com" },
    ]);

    const result = extractCookies(session, BASE_URL);
    expect(result.cookieHeader).toContain("JSESSIONID=abc123");
    expect(result.cookieHeader).not.toContain("other=nope");
  });

  it("handles leading dot in domain (wildcard domain cookies)", () => {
    const session = makeSession([
      { name: "JSESSIONID", value: "abc123", domain: ".example.com" },
    ]);

    const result = extractCookies(session, BASE_URL);
    expect(result.cookieHeader).toContain("JSESSIONID=abc123");
  });

  it("returns empty string when no cookies match", () => {
    const session = makeSession([
      { name: "other", value: "val", domain: "external.com" },
    ]);

    const result = extractCookies(session, BASE_URL);
    expect(result.cookieHeader).toBe("");
  });
});

// ---------------------------------------------------------------------------
// loadAndValidateSession — mocked
// ---------------------------------------------------------------------------

describe("loadAndValidateSession", () => {
  // We mock the session-store, playwright-auth, and axios at the module level
  vi.mock("../auth/session-store.js", () => ({
    readSession: vi.fn(),
  }));

  vi.mock("../auth/playwright-auth.js", () => ({
    runAutomaticLogin: vi.fn(),
    validateCandidateSession: vi.fn(),
  }));

  vi.mock("axios", async () => {
    const actual = await vi.importActual<typeof import("axios")>("axios");
    return {
      ...actual,
      default: {
        ...actual.default,
        create: vi.fn(() => ({
          get: vi.fn(),
        })),
        get: vi.fn(),
      },
    };
  });

  beforeEach(() => {
    process.env.JIRA_BASE_URL = BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("throws AUTH_REQUIRED when no session file exists", async () => {
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(null);

    const { loadAndValidateSession } = await import("../auth/session-manager.js");

    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("attempts auto-login when credentials are configured and no session file exists", async () => {
    const playwrightAuth = await import("../auth/playwright-auth.js");
    vi.mocked(playwrightAuth.runAutomaticLogin).mockReset();
    const runAutomaticLoginMock = vi.mocked(playwrightAuth.runAutomaticLogin);
    runAutomaticLoginMock.mockResolvedValue();

    const { readSession } = await import("../auth/session-store.js");
    const readSessionMock = vi.mocked(readSession);
    
    const validSession = {
      savedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      storageState: {
        cookies: [{ name: "JSESSIONID", value: "new_session_id", domain: "jira.example.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }],
        origins: [],
      },
    };
    
    readSessionMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(validSession);

    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockImplementation(async (_url, options) => {
      const headers = options?.headers as Record<string, string> | undefined;
      if (headers?.Authorization) {
        throw new Error("basic auth unavailable");
      }
      return { status: 200, data: { name: "cookie-user" } };
    });

    process.env.JIRA_EMAIL = "test@example.com";
    process.env.JIRA_PASSWORD = "password";

    const { loadAndValidateSession } = await import("../auth/session-manager.js");

    const result = await loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself");
    
    expect(runAutomaticLoginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: BASE_URL,
        sessionFilePath: ".jira/session.json",
        email: "test@example.com",
        password: "password",
        headless: true,
      })
    );
    expect(result.cookieHeader).toContain("JSESSIONID=new_session_id");

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("returns Basic Auth without opening Playwright when credentials validate", async () => {
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockResolvedValue({
      status: 200,
      data: { name: "test-user" },
    });
    const playwrightAuth = await import("../auth/playwright-auth.js");
    vi.mocked(playwrightAuth.runAutomaticLogin).mockReset();

    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    const result = await loadAndValidateSession(
      ".jira/session.json",
      BASE_URL,
      "/rest/api/2/myself"
    );

    expect(result).toEqual({
      cookieHeader: "",
      authorizationHeader: `Basic ${Buffer.from("user@example.com:secret").toString("base64")}`,
    });
    expect(playwrightAuth.runAutomaticLogin).not.toHaveBeenCalled();
    expect(vi.mocked(axiosMod.default.get)).toHaveBeenCalledWith(
      `${BASE_URL}/rest/api/2/myself`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("falls back to the stored cookie after Basic Auth and auto-login fail", async () => {
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const session = makeSession([{ name: "JSESSIONID", value: "existing" }]);
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(session);
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockImplementation(async (_url, options) => {
      const headers = options?.headers as Record<string, string> | undefined;
      if (headers?.Authorization) {
        throw new Error("basic rejected");
      }
      return { status: 200, data: { name: "cookie-user" } };
    });
    const playwrightAuth = await import("../auth/playwright-auth.js");
    vi.mocked(playwrightAuth.runAutomaticLogin).mockRejectedValue(new Error("browser failed"));

    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).resolves.toEqual({ cookieHeader: "JSESSIONID=existing" });

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  function makeSession(cookies: Array<{ name: string; value: string }>): SessionFile {
    return {
      savedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      storageState: {
        cookies: cookies.map((cookie) => ({
          ...cookie,
          domain: "jira.example.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax" as const,
        })),
        origins: [],
      },
    };
  }
});
