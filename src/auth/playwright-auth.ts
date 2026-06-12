import { chromium, firefox, webkit } from "playwright";
import axios from "axios";
import { readSession, writeSession } from "./session-store.js";
import { extractCookies } from "./session-manager.js";
import type { SessionFile } from "../types.js";

type BrowserEngine = "chromium" | "firefox" | "webkit";

// ---------------------------------------------------------------------------
// Interactive SSO login
// ---------------------------------------------------------------------------

/**
 * Launches a browser in headed mode, navigates to the Jira base URL, and
 * waits for the operator to complete the SSO flow manually.
 *
 * The session is ONLY written to disk when:
 * 1. The browser URL has left all SSO/login path patterns, AND
 * 2. A test HTTP call to `validatePath` returns HTTP 2xx.
 *
 * If the validation fails, any previously saved session is preserved
 * (the new incomplete state is not written).
 */
export async function runInteractiveLogin(options: {
  baseUrl: string;
  sessionFilePath: string;
  headless: boolean;
  browser: BrowserEngine;
  validatePath?: string;
}): Promise<void> {
  const {
    baseUrl,
    sessionFilePath,
    headless,
    browser: browserName,
    validatePath = "/rest/api/2/myself",
  } = options;

  console.log(`\n🔐 Launching ${browserName} to authenticate with Jira...\n`);
  console.log(`   Base URL : ${baseUrl}`);
  console.log(`   Session  : ${sessionFilePath}\n`);

  const browserFactory = getBrowserFactory(browserName);
  const browserInstance = await browserFactory.launch({ headless });
  const context = await browserInstance.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl);

  console.log("👉 Complete the SSO login in the browser window.");
  console.log("   Waiting for you to reach the Jira dashboard...\n");

  // Poll the current URL until we've left all common SSO path patterns
  const ssoPatterns = ["/login", "/sso", "/idp", "/auth", "/saml", "/oauth", "/openid-connect"];

  const deadline = Date.now() + 300_000; // 5 minutes
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const onSsoPage = ssoPatterns.some((p) => currentUrl.includes(p));
    if (!onSsoPage) break;
    await page.waitForTimeout(2_000);
  }

  // Give the page a moment to settle and flush session cookies
  await page.waitForTimeout(2_000);

  const storageState = await context.storageState();
  await browserInstance.close();

  // ---------------------------------------------------------------------------
  // Validate BEFORE writing — do not overwrite an existing good session
  // with one that hasn't completed login yet.
  // ---------------------------------------------------------------------------
  const candidate: SessionFile = {
    savedAt: new Date().toISOString(),
    baseUrl,
    storageState,
  };

  console.log("🔍 Verifying new session before saving...");
  const isValid = await validateCandidateSession(candidate, baseUrl, validatePath);

  if (!isValid) {
    // The browser closed but the session is not usable — leave the old one intact
    throw new Error(
      "Login did not complete successfully: the new session failed validation.\n" +
      "Your previous session (if any) has NOT been overwritten.\n" +
      "Please run jira-auth-login again and ensure you reach the Jira dashboard before closing the browser."
    );
  }

  await writeSession(sessionFilePath, candidate);

  console.log(`\n✅ Session saved to ${sessionFilePath}`);
  console.log(`   Saved at : ${candidate.savedAt}\n`);
}

// ---------------------------------------------------------------------------
// Internal: candidate session validation (no disk read/write side-effects)
// ---------------------------------------------------------------------------

/**
 * Returns true if the candidate SessionFile produces a 2xx response from Jira.
 * Never throws — returns false on any failure so callers can decide.
 */
export async function validateCandidateSession(
  candidate: SessionFile,
  baseUrl: string,
  validatePath: string
): Promise<boolean> {
  const cookies = extractCookies(candidate, baseUrl);
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

    // Guard against Jira returning HTML login page with 200 OK
    if (typeof res.data === "string" && isLoginPage(res.data)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function getBrowserFactory(name: BrowserEngine) {
  switch (name) {
    case "firefox":
      return firefox;
    case "webkit":
      return webkit;
    default:
      return chromium;
  }
}

function isLoginPage(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.startsWith("<!") &&
    (lower.includes("log in") || lower.includes("login") || lower.includes("sso"))
  );
}

// ---------------------------------------------------------------------------
// Automatic background SSO/credential login
// ---------------------------------------------------------------------------

/**
 * Launches a browser in headless mode, navigates to the Jira base URL,
 * and attempts to fill the email/username and password using common login selectors.
 *
 * Saves the session only on successful validation.
 */
export async function runAutomaticLogin(options: {
  baseUrl: string;
  sessionFilePath: string;
  email: string;
  password: string;
  headless: boolean;
  browser: BrowserEngine;
  validatePath?: string;
}): Promise<void> {
  const {
    baseUrl,
    sessionFilePath,
    email,
    password,
    headless,
    browser: browserName,
    validatePath = "/rest/api/2/myself",
  } = options;

  console.error(`\n🔐 Launching ${browserName} for automatic background login...\n`);
  console.error(`   Base URL : ${baseUrl}`);
  console.error(`   Session  : ${sessionFilePath}\n`);

  const browserFactory = getBrowserFactory(browserName);
  const browserInstance = await browserFactory.launch({ headless });
  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseUrl);
    await page.waitForLoadState("networkidle");

    const usernameSelectors = [
      'input[name="os_username"]',
      'input[name="username"]',
      'input[type="email"]',
      'input[type="text"]',
      '#username',
      '#login-form-username',
      '#os_username',
    ];

    const passwordSelectors = [
      'input[name="os_password"]',
      'input[name="password"]',
      'input[type="password"]',
      '#password',
      '#login-form-password',
      '#os_password',
    ];

    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      '#login-form-submit',
      '#login',
      '#submit',
      'button:has-text("Log In")',
      'button:has-text("Sign In")',
      'button:has-text("Next")',
    ];

    const deadline = Date.now() + 60_000; // 1 minute timeout for auto-login
    let loggedIn = false;

    while (Date.now() < deadline) {
      const currentUrl = page.url();
      const ssoPatterns = ["/login", "/sso", "/idp", "/auth", "/saml", "/oauth", "/openid-connect"];
      const onSsoPage = ssoPatterns.some((p) => currentUrl.includes(p));

      if (!onSsoPage) {
        const currentCookies = await context.cookies();
        if (currentCookies.length > 0) {
          const storageState = await context.storageState();
          const candidate: SessionFile = {
            savedAt: new Date().toISOString(),
            baseUrl,
            storageState,
          };
          if (await validateCandidateSession(candidate, baseUrl, validatePath)) {
            loggedIn = true;
            break;
          }
        }
      }

      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        const el = page.locator(selector).first();
        if (await el.isVisible()) {
          const val = await el.inputValue();
          if (val !== email) {
            await el.fill(email);
          }
          usernameFilled = true;
          break;
        }
      }

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        const el = page.locator(selector).first();
        if (await el.isVisible()) {
          const val = await el.inputValue();
          if (val !== password) {
            await el.fill(password);
          }
          passwordFilled = true;
          break;
        }
      }

      if (usernameFilled || passwordFilled) {
        let submitted = false;
        if (passwordFilled) {
          for (const selector of passwordSelectors) {
            const el = page.locator(selector).first();
            if (await el.isVisible()) {
              await el.press("Enter");
              submitted = true;
              break;
            }
          }
        }

        if (!submitted) {
          for (const selector of submitSelectors) {
            const el = page.locator(selector).first();
            if (await el.isVisible()) {
              await el.click();
              submitted = true;
              break;
            }
          }
        }
      }

      await page.waitForTimeout(2_000);
    }

    if (!loggedIn) {
      const storageState = await context.storageState();
      const candidate: SessionFile = {
        savedAt: new Date().toISOString(),
        baseUrl,
        storageState,
      };
      if (await validateCandidateSession(candidate, baseUrl, validatePath)) {
        loggedIn = true;
      }
    }

    if (!loggedIn) {
      throw new Error(
        "Automatic login failed: could not authenticate with provided credentials.\n" +
        "Please check your JIRA_EMAIL and JIRA_PASSWORD."
      );
    }

    const storageState = await context.storageState();
    const candidate: SessionFile = {
      savedAt: new Date().toISOString(),
      baseUrl,
      storageState,
    };
    await writeSession(sessionFilePath, candidate);
    console.error(`\n✅ Session saved to ${sessionFilePath}`);
  } finally {
    await browserInstance.close();
  }
}

// ---------------------------------------------------------------------------
// Re-export readSession for test convenience
// ---------------------------------------------------------------------------
export { readSession };
