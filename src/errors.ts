// ---------------------------------------------------------------------------
// Internal error taxonomy for the Jira MCP server
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "JIRA_HTTP_ERROR"
  | "JIRA_RESPONSE_ERROR"
  | "CONFIG_ERROR"
  | "INVALID_INPUT";

/**
 * Structured internal error. All layers throw this instead of plain Error
 * so callers can discriminate on `code` without string-matching messages.
 */
export class McpError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.details = details;
    // Maintain proper prototype chain in ES2022 + TS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Factory helpers — keeps call sites concise
// ---------------------------------------------------------------------------

export function authRequired(message = "No Jira session found. Run `jira-auth-login` to authenticate."): McpError {
  return new McpError("AUTH_REQUIRED", message);
}

export function sessionExpired(message = "Jira session has expired. Run `jira-auth-login` to reauthenticate."): McpError {
  return new McpError("SESSION_EXPIRED", message);
}

export function jiraHttpError(status: number, url: string, body?: string): McpError {
  return new McpError(
    "JIRA_HTTP_ERROR",
    `Jira HTTP ${status} from ${url}`,
    { status, url, body }
  );
}

export function jiraResponseError(message: string, raw?: unknown): McpError {
  return new McpError("JIRA_RESPONSE_ERROR", message, raw);
}

export function configError(message: string, details?: unknown): McpError {
  return new McpError("CONFIG_ERROR", message, details);
}

export function invalidInput(message: string, details?: unknown): McpError {
  return new McpError("INVALID_INPUT", message, details);
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function isMcpError(err: unknown): err is McpError {
  return err instanceof McpError;
}
