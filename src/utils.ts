// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

import dayjs from "dayjs";

/** Bound for session/cookie/Basic Auth probes. Must stay under typical MCP client timeouts. */
export const SESSION_VALIDATE_TIMEOUT_MS = 8_000;

/** Fail-closed bound for Jira/GitLab REST calls so a hung proxy cannot block stdio MCP. */
export const HTTP_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Returns today's date in yyyy-MM-dd format using the local timezone.
 */
export function todayLocalDate(): string {
  return dayjs().format("YYYY-MM-DD");
}

/**
 * Appends a navigation hint section to tool output markdown.
 *
 * Usage: append `navigationHint("...", "...")` to the end of any tool's formatted text.
 *
 * @param suggestions - Each suggestion is one actionable next step (tool call with params).
 */
export function navigationHint(...suggestions: string[]): string {
  return "\n\n---\n💡 **Next:** " + suggestions.join(" | ");
}

/**
 * Escapes a value for use inside a quoted JQL string literal.
 */
export function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** HTTP status codes that should be retried with backoff. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503;
}

/** Extract HTTP status from an McpError thrown by HTTP clients. */
export function getHttpStatusFromError(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  if (!("code" in err) || (err as { code?: string }).code !== "JIRA_HTTP_ERROR") {
    return undefined;
  }
  const details = (err as { details?: { status?: number } }).details;
  return details?.status;
}

export interface HttpRetryOptions {
  retries?: number;
  baseMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async HTTP operation on 429 / 502 / 503 with exponential backoff + jitter.
 */
export async function withHttpRetry<T>(
  fn: () => Promise<T>,
  options?: HttpRetryOptions
): Promise<T> {
  const retries = options?.retries ?? 3;
  const baseMs = options?.baseMs ?? 300;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = getHttpStatusFromError(err);
      if (status == null || !isRetryableHttpStatus(status) || attempt >= retries) {
        throw err;
      }
      const jitter = Math.random() * 100;
      await sleep(baseMs * 2 ** attempt + jitter);
    }
  }

  throw lastError;
}

export type ConcurrencyResult<T, R> =
  | { ok: true; item: T; index: number; value: R }
  | { ok: false; item: T; index: number; error: unknown };

/**
 * Maps items with a bounded worker pool. Preserves input order in results.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<ConcurrencyResult<T, R>>> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results: Array<ConcurrencyResult<T, R>> = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const item = items[index]!;
      try {
        const value = await fn(item, index);
        results[index] = { ok: true, item, index, value };
      } catch (error) {
        results[index] = { ok: false, item, index, error };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/** Splits an array into fixed-size chunks. */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
