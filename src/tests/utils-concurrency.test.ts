import { describe, expect, it, vi } from "vitest";
import { isMcpError, jiraHttpError } from "../errors.js";
import {
  chunkArray,
  getHttpStatusFromError,
  isRetryableHttpStatus,
  mapWithConcurrency,
  withHttpRetry,
} from "../utils.js";

describe("isRetryableHttpStatus", () => {
  it("returns true for 429, 502, 503", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
  });

  it("returns false for other statuses", () => {
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(500)).toBe(false);
  });
});

describe("getHttpStatusFromError", () => {
  it("extracts status from JIRA_HTTP_ERROR", () => {
    const err = jiraHttpError(429, "https://example.com");
    expect(getHttpStatusFromError(err)).toBe(429);
  });

  it("returns undefined for non-http errors", () => {
    expect(getHttpStatusFromError(new Error("boom"))).toBeUndefined();
  });
});

describe("withHttpRetry", () => {
  it("retries retryable failures then succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(jiraHttpError(429, "https://example.com"))
      .mockResolvedValue("ok");

    const promise = withHttpRetry(fn, { retries: 2, baseMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry non-retryable failures", async () => {
    const fn = vi.fn().mockRejectedValue(jiraHttpError(404, "https://example.com"));
    await expect(withHttpRetry(fn)).rejects.toSatisfy(isMcpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5];

    const results = await mapWithConcurrency(items, 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([2, 4, 6, 8, 10]);
  });

  it("captures per-item errors without aborting the pool", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error("fail");
      return item;
    });

    expect(results[0]).toEqual({ ok: true, item: 1, index: 0, value: 1 });
    expect(results[1]?.ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, item: 3, index: 2, value: 3 });
  });
});

describe("chunkArray", () => {
  it("splits arrays into fixed-size chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
