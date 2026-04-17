import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

describe("checkRateLimit (in-memory)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and does not suggest a retry delay", async () => {
    const key = `test-first-${Math.random()}`;
    const result = await checkRateLimit(key, { windowMs: 60_000, maxRequests: 3 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows requests up to the limit within the window", async () => {
    const key = `test-up-to-limit-${Math.random()}`;
    const options = { windowMs: 60_000, maxRequests: 3 };

    const a = await checkRateLimit(key, options);
    const b = await checkRateLimit(key, options);
    const c = await checkRateLimit(key, options);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBe(0);
  });

  it("denies requests past the limit and reports retryAfterMs", async () => {
    const key = `test-denied-${Math.random()}`;
    const options = { windowMs: 60_000, maxRequests: 2 };

    await checkRateLimit(key, options);
    await checkRateLimit(key, options);
    const denied = await checkRateLimit(key, options);

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("resets the counter after the window expires", async () => {
    const key = `test-reset-${Math.random()}`;
    const options = { windowMs: 60_000, maxRequests: 1 };

    const first = await checkRateLimit(key, options);
    expect(first.allowed).toBe(true);

    const secondInWindow = await checkRateLimit(key, options);
    expect(secondInWindow.allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    const firstInNewWindow = await checkRateLimit(key, options);
    expect(firstInNewWindow.allowed).toBe(true);
    expect(firstInNewWindow.retryAfterMs).toBe(0);
  });

  it("scopes the counter by key", async () => {
    const options = { windowMs: 60_000, maxRequests: 1 };
    const a = await checkRateLimit(`k-a-${Math.random()}`, options);
    const b = await checkRateLimit(`k-b-${Math.random()}`, options);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("returns the first IP from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.2" });
    expect(getClientIp(headers)).toBe("203.0.113.1");
  });

  it("trims whitespace in x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.1  " });
    expect(getClientIp(headers)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.5" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("returns 'unknown' when no IP header is present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
