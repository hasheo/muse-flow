import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `src/lib/env.ts` validates `process.env` at module load time, so each
 * scenario reloads the module after mutating env. We restore the original
 * env after every case to keep tests independent.
 */

const ORIGINAL_ENV = { ...process.env };

async function loadEnvModule() {
  vi.resetModules();
  return import("@/lib/env");
}

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("env validation", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    warnSpy.mockRestore();
  });

  describe("in production", () => {
    beforeEach(() => {
      setEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app",
        NEXTAUTH_URL: "https://app.example.com",
        NEXTAUTH_SECRET: "a".repeat(48),
        YOUTUBE_API_KEY: "real-youtube-api-key-value",
      });
    });

    it("accepts a valid production environment", async () => {
      const { env } = await loadEnvModule();
      expect(env.NEXTAUTH_SECRET.length).toBeGreaterThanOrEqual(32);
      expect(env.NEXTAUTH_URL).toMatch(/^https:\/\//);
    });

    it("rejects a NEXTAUTH_SECRET shorter than 32 characters", async () => {
      setEnv({ NEXTAUTH_SECRET: "short-secret" });
      await expect(loadEnvModule()).rejects.toThrow(/at least 32 characters/);
    });

    it("rejects a placeholder NEXTAUTH_SECRET even when long enough", async () => {
      setEnv({ NEXTAUTH_SECRET: "ci-secret-change-me-please-rotate-this" });
      await expect(loadEnvModule()).rejects.toThrow(/placeholder/i);
    });

    it("rejects a NEXTAUTH_URL that is not https", async () => {
      setEnv({ NEXTAUTH_URL: "http://app.example.com" });
      await expect(loadEnvModule()).rejects.toThrow(/https:\/\//);
    });

    it("rejects a missing NEXTAUTH_SECRET", async () => {
      setEnv({ NEXTAUTH_SECRET: undefined });
      await expect(loadEnvModule()).rejects.toThrow(/NEXTAUTH_SECRET/);
    });

    it("rejects an invalid DATABASE_URL", async () => {
      setEnv({ DATABASE_URL: "not-a-url" });
      await expect(loadEnvModule()).rejects.toThrow(/DATABASE_URL/);
    });
  });

  describe("in development", () => {
    beforeEach(() => {
      setEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/dev",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "dev-secret",
        YOUTUBE_API_KEY: "dev-key",
      });
    });

    it("accepts a short, placeholder-shaped secret", async () => {
      const { env } = await loadEnvModule();
      expect(env.NEXTAUTH_SECRET).toBe("dev-secret");
    });

    it("warns instead of throwing when required vars are missing", async () => {
      setEnv({ YOUTUBE_API_KEY: undefined });
      await expect(loadEnvModule()).resolves.toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
