/**
 * body-normalizer.ts
 *
 * Centralises the normalizeJiraBody() function and JiraBodyFormat type.
 *
 * Targets Jira Server / Data Center (v8.x) which uses Wiki Markup (plain text),
 * NOT ADF (Atlassian Document Format, which is Jira Cloud only).
 *
 * Format modes:
 *   "plain"    – pass the string through as-is (Wiki Markup or plain text)
 *   "markdown" – convert Markdown → Jira Wiki Markup
 *   "adf"      – NOT supported on Jira Server; raw string is returned as-is
 *                with a warning comment prepended so the LLM can see it.
 *
 * Dependency graph (acyclic):
 *   markdown-to-wiki.ts  (parser, imports remark only)
 *   body-normalizer.ts   (imports markdown-to-wiki, owns normalizeJiraBody)
 *   tool files           (import from body-normalizer.ts)
 */

import { invalidInput } from "../errors.js";
import { markdownToWiki } from "./markdown-to-wiki.js";

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------

export type JiraBodyFormat = "plain" | "markdown" | "adf";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes a comment/description body to a string suitable for Jira Server (v8.x).
 *
 * Jira Server uses Wiki Markup (plain strings), NOT ADF JSON objects.
 *
 * - "plain"    – returns the raw string as-is (caller can write Jira Wiki Markup directly)
 * - "markdown" – converts Markdown to Jira Wiki Markup via remark AST
 * - "adf"      – not supported on Jira Server; throws invalidInput error
 *
 * @throws McpError (invalidInput) when body is not a string or format is "adf"
 */
export function normalizeJiraBody(
  body: string | Record<string, unknown>,
  format: JiraBodyFormat = "markdown"
): string {
  if (format === "adf") {
    throw invalidInput(
      'bodyFormat "adf" is not supported on Jira Server (v8.x). ' +
      'Use "plain" (Wiki Markup or plain text) or "markdown" (converts Markdown to Jira Wiki Markup).'
    );
  }

  if (typeof body !== "string") {
    throw invalidInput(
      `body must be a string when bodyFormat is "${format}". ` +
      "Received an object — did you mean to use bodyFormat \"adf\"? (Not supported on Jira Server)"
    );
  }

  if (format === "plain") {
    return body;
  }

  // format === "markdown"
  return markdownToWiki(body);
}
