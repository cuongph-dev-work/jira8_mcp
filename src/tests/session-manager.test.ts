import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractCookies } from "../auth/session-manager.js";
import { SESSION_VALIDATE_TIMEOUT_MS } from "../utils.js";
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
  vi.mock("../auth/session-store.js", () => ({
    readSession: vi.fn(),
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

  it("throws AUTH_REQUIRED without Playwright when credentials exist but Basic Auth fails", async () => {
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(null);

    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockRejectedValue(new Error("basic auth unavailable"));

    process.env.JIRA_EMAIL = "test@example.com";
    process.env.JIRA_PASSWORD = "password";

    const { loadAndValidateSession } = await import("../auth/session-manager.js");

    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    expect(vi.mocked(axiosMod.default.get)).toHaveBeenCalledWith(
      `${BASE_URL}/rest/api/2/myself`,
      expect.objectContaining({
        timeout: SESSION_VALIDATE_TIMEOUT_MS,
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("returns Basic Auth when credentials validate and no cookie session exists", async () => {
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(null);

    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockResolvedValue({
      status: 200,
      data: { name: "test-user" },
    });

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
    expect(vi.mocked(axiosMod.default.get)).toHaveBeenCalledWith(
      `${BASE_URL}/rest/api/2/myself`,
      expect.objectContaining({
        timeout: SESSION_VALIDATE_TIMEOUT_MS,
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("prefers a valid stored cookie even when credentials are configured", async () => {
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const session = makeSession([
      { name: "JSESSIONID", value: "existing", domain: "jira.example.com" },
    ]);
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(session);
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockImplementation(async (_url, options) => {
      const headers = options?.headers as Record<string, string> | undefined;
      if (headers?.Authorization) {
        throw new Error("basic should not be used when cookie is valid");
      }
      return { status: 200, data: { name: "cookie-user" } };
    });

    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).resolves.toEqual({ cookieHeader: "JSESSIONID=existing" });

    expect(vi.mocked(axiosMod.default.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axiosMod.default.get)).toHaveBeenCalledWith(
      `${BASE_URL}/rest/api/2/myself`,
      expect.objectContaining({
        timeout: SESSION_VALIDATE_TIMEOUT_MS,
        headers: expect.objectContaining({
          Cookie: "JSESSIONID=existing",
        }),
      })
    );

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("falls back to Basic Auth when the stored cookie is rejected", async () => {
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_PASSWORD = "secret";

    const session = makeSession([
      { name: "JSESSIONID", value: "stale", domain: "jira.example.com" },
    ]);
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(session);
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockImplementation(async (_url, options) => {
      const headers = options?.headers as Record<string, string> | undefined;
      if (headers?.Cookie) {
        throw new Error("cookie expired");
      }
      return { status: 200, data: { name: "basic-user" } };
    });

    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).resolves.toEqual({
      cookieHeader: "",
      authorizationHeader: `Basic ${Buffer.from("user@example.com:secret").toString("base64")}`,
    });

    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_PASSWORD;
  });

  it("treats a validation timeout as an invalid session", async () => {
    const session = makeSession([
      { name: "JSESSIONID", value: "existing", domain: "jira.example.com" },
    ]);
    const { readSession } = await import("../auth/session-store.js");
    vi.mocked(readSession).mockResolvedValue(session);
    const axiosMod = await import("axios");
    vi.mocked(axiosMod.default.get).mockRejectedValue(
      Object.assign(new Error("timeout of 8000ms exceeded"), { code: "ECONNABORTED" })
    );

    const { loadAndValidateSession } = await import("../auth/session-manager.js");
    await expect(
      loadAndValidateSession(".jira/session.json", BASE_URL, "/rest/api/2/myself")
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});
