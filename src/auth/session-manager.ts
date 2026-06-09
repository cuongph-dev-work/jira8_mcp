import axios from "axios";
import { readSession } from "./session-store.js";
import { authRequired, sessionExpired } from "../errors.js";
import type { PlaywrightCookie, SessionCookies, SessionFile } from "../types.js";

// ---------------------------------------------------------------------------
// Cookie extraction
// ---------------------------------------------------------------------------

/**
 * Converts Playwright cookie objects into an HTTP Cookie header string.
 * Only includes cookies whose domain matches the base URL host.
 */
export function extractCookies(
  session: SessionFile,
  baseUrl: string
): SessionCookies {
  const host = new URL(baseUrl).hostname;

  const matched: PlaywrightCookie[] = session.storageState.cookies?.filter((c: PlaywrightCookie) => {
    return host.endsWith(c.domain.replace(/^\./, ""));
  }) ?? [];

  const cookieHeader = matched
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return { cookieHeader };
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

/**
 * Loads the session from disk and validates it against the Jira REST API.
 * If validation fails or the session file is missing, and automatic credentials
 * are configured, it attempts to perform a background login.
 *
 * Throws:
 * - `AUTH_REQUIRED` if no session file exists (and auto-login is disabled/failed)
 * - `SESSION_EXPIRED` if the session exists but Jira rejects it (and auto-login is disabled/failed)
 */
export async function loadAndValidateSession(
  sessionFilePath: string,
  baseUrl: string,
  validatePath: string
): Promise<SessionCookies> {
  let session = await readSession(sessionFilePath);
  let isValid = false;
  let cookies: SessionCookies | null = null;

  if (session !== null) {
    cookies = extractCookies(session, baseUrl);
    const validateUrl = `${baseUrl}${validatePath}`;

    try {
      const res = await axios.get(validateUrl, {
        headers: {
          Cookie: cookies.cookieHeader,
          Accept: "application/json",
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      if (!isLoginPageResponse(res.data)) {
        isValid = true;
      }
    } catch {
      isValid = false;
    }
  }

  if (isValid && cookies) {
    return cookies;
  }

  // Session missing or invalid. Check if JIRA_EMAIL and JIRA_PASSWORD are configured
  if (process.env.JIRA_EMAIL && process.env.JIRA_PASSWORD) {
    try {
      process.stderr.write("[jira-run-mcp] Session invalid or missing. Attempting automatic login...\n");
      const { runAutomaticLogin } = await import("./playwright-auth.js");
      await runAutomaticLogin({
        baseUrl,
        sessionFilePath,
        email: process.env.JIRA_EMAIL,
        password: process.env.JIRA_PASSWORD,
        headless: true, // Auto-login in background is headless
        browser: (process.env.PLAYWRIGHT_BROWSER as "chromium" | "firefox" | "webkit") || "chromium",
        validatePath,
      });

      // Reload session and validate
      session = await readSession(sessionFilePath);
      if (session !== null) {
        cookies = extractCookies(session, baseUrl);
        return cookies;
      }
    } catch (loginErr: unknown) {
      process.stderr.write(`[jira-run-mcp] Auto-login failed: ${String(loginErr)}\n`);
    }
  }

  if (session === null) {
    throw authRequired();
  }
  throw sessionExpired();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isLoginPageResponse(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("<title>log in") ||
    lower.includes("id=\"login-form\"") ||
    lower.includes("sso") && lower.includes("<html")
  );
}

function isAxiosError(err: unknown): err is { response?: { status: number } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "isAxiosError" in err &&
    (err as { isAxiosError: boolean }).isAxiosError === true
  );
}
