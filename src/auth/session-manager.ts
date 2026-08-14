import axios from "axios";
import { readSession } from "./session-store.js";
import { authRequired, sessionExpired } from "../errors.js";
import { SESSION_VALIDATE_TIMEOUT_MS } from "../utils.js";
import type { PlaywrightCookie, SessionCookies, SessionFile } from "../types.js";

const AUTH_HINT =
  "Run `jira-auth-login` for interactive SSO. HTTP Basic Auth (JIRA_EMAIL / JIRA_PASSWORD) only works if this Jira instance accepts it.";

/** Builds an HTTP Basic Authorization value without persisting credentials. */
export function createBasicAuthorizationHeader(username: string, password: string): string {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${auth}`;
}

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
 *
 * Order (all probes are time-bounded — never launches a browser):
 * 1. Stored cookie session, if the file exists and Jira accepts it
 * 2. HTTP Basic Auth, if JIRA_EMAIL and JIRA_PASSWORD are configured
 *
 * Throws:
 * - `AUTH_REQUIRED` if no session file exists and Basic Auth is unavailable/rejected
 * - `SESSION_EXPIRED` if the session exists but Jira rejects it (and Basic Auth failed)
 */
export async function loadAndValidateSession(
  sessionFilePath: string,
  baseUrl: string,
  validatePath: string
): Promise<SessionCookies> {
  const email = process.env.JIRA_EMAIL?.trim() || undefined;
  const password = process.env.JIRA_PASSWORD || undefined;

  const session = await readSession(sessionFilePath);

  if (session) {
    const cookies = extractCookies(session, baseUrl);
    if (await validateCookies(baseUrl, validatePath, cookies)) {
      return cookies;
    }
  }

  if (email && password) {
    const authorizationHeader = createBasicAuthorizationHeader(email, password);
    if (await validateAuthorization(baseUrl, validatePath, authorizationHeader)) {
      return { cookieHeader: "", authorizationHeader };
    }
  }

  if (!session) {
    throw authRequired(
      email && password
        ? `No Jira session found. HTTP Basic Auth was rejected. ${AUTH_HINT}`
        : undefined
    );
  }

  throw sessionExpired(
    email && password
      ? `Jira session has expired. HTTP Basic Auth was rejected. ${AUTH_HINT}`
      : undefined
  );
}

async function validateAuthorization(
  baseUrl: string,
  validatePath: string,
  authorizationHeader: string
): Promise<boolean> {
  return probeMyself(baseUrl, validatePath, {
    Authorization: authorizationHeader,
  });
}

export async function validateCookies(
  baseUrl: string,
  validatePath: string,
  cookies: SessionCookies
): Promise<boolean> {
  return probeMyself(baseUrl, validatePath, {
    ...(cookies.cookieHeader ? { Cookie: cookies.cookieHeader } : {}),
  });
}

async function probeMyself(
  baseUrl: string,
  validatePath: string,
  headers: Record<string, string>
): Promise<boolean> {
  try {
    const res = await axios.get(`${baseUrl}${validatePath}`, {
      headers: {
        ...headers,
        Accept: "application/json",
      },
      maxRedirects: 0,
      timeout: SESSION_VALIDATE_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return res.status >= 200 && res.status < 300 && !isLoginPageResponse(res.data);
  } catch {
    return false;
  }
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
