import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSurvivalSessionToken,
  verifySurvivalSessionToken,
} from "@/lib/survival-session";

const ORIGINAL_SECRET = process.env.QUIZ_SESSION_SECRET;
const ORIGINAL_NEXTAUTH = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.QUIZ_SESSION_SECRET = "test-secret-for-survival-session-tests-12345678";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.QUIZ_SESSION_SECRET;
  else process.env.QUIZ_SESSION_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_NEXTAUTH === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH;
});

function baseInput(overrides: Partial<Parameters<typeof createSurvivalSessionToken>[0]> = {}) {
  return {
    userId: "user-1",
    difficulty: "normal" as const,
    answerMode: "typed" as const,
    score: 0,
    strikes: 0,
    strikesAllowed: 3,
    seen: ["track-1"],
    pendingId: "track-1",
    pendingStart: 30,
    ...overrides,
  };
}

describe("survival-session", () => {
  it("creates a token that verifies and round-trips its payload", () => {
    const token = createSurvivalSessionToken(baseInput({ score: 5, strikes: 1 }));
    const result = verifySurvivalSessionToken(token);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.uid).toBe("user-1");
    expect(result.payload.score).toBe(5);
    expect(result.payload.strikes).toBe(1);
    expect(result.payload.pending).toBe("track-1");
    expect(result.payload.seen).toEqual(["track-1"]);
  });

  it("rejects a token with a tampered payload", () => {
    const token = createSurvivalSessionToken(baseInput({ score: 0 }));
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.score = 9999;
    const tamperedPayload = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    const result = verifySurvivalSessionToken(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("Invalid signature");
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSurvivalSessionToken(baseInput());
    process.env.QUIZ_SESSION_SECRET = "a-different-secret-entirely-32chars-long";
    const result = verifySurvivalSessionToken(token);
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed token shape", () => {
    expect(verifySurvivalSessionToken("not-a-token").valid).toBe(false);
    expect(verifySurvivalSessionToken("only.two").valid).toBe(false);
  });

  it("caps the seen array to prevent unbounded token growth", () => {
    const longSeen = Array.from({ length: 500 }, (_, i) => `track-${i}`);
    const token = createSurvivalSessionToken(baseInput({ seen: longSeen }));
    const result = verifySurvivalSessionToken(token);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    // MAX_SEEN_IDS is 200; we should retain the tail (most recent).
    expect(result.payload.seen.length).toBeLessThanOrEqual(200);
    expect(result.payload.seen.at(-1)).toBe("track-499");
  });

  it("rejects expired tokens", () => {
    const token = createSurvivalSessionToken(baseInput({ ttlSeconds: -10 }));
    const result = verifySurvivalSessionToken(token);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("Token expired");
  });

  it("falls back to NEXTAUTH_SECRET when QUIZ_SESSION_SECRET is missing", () => {
    delete process.env.QUIZ_SESSION_SECRET;
    process.env.NEXTAUTH_SECRET = "fallback-secret-of-sufficient-length-abcdef";
    const token = createSurvivalSessionToken(baseInput());
    const result = verifySurvivalSessionToken(token);
    expect(result.valid).toBe(true);
  });
});
