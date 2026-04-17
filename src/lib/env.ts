import { z } from "zod";

/**
 * Runtime environment validation.
 *
 * Validates required env vars at module load time and fails fast on
 * misconfigured production deploys (missing secrets, placeholder values,
 * short secrets). In development and test we warn but allow looser values
 * so local setup and CI remain ergonomic.
 *
 * Usage: `import { env } from "@/lib/env"` anywhere you'd reach for
 * `process.env.FOO` — this gives you typed access plus the guarantee
 * that validation has already run.
 */

const NODE_ENV = (process.env.NODE_ENV ?? "development") as
  | "development"
  | "production"
  | "test";

const isProduction = NODE_ENV === "production";

// Known weak/placeholder secrets that should never reach production.
// Matched case-insensitively against the full secret value or as a
// substring — whichever makes sense for each pattern.
const WEAK_SECRET_SUBSTRINGS = [
  "change-me",
  "changeme",
  "ci-secret",
  "ci-placeholder",
  "placeholder",
  "test-",
  "your-",
  "example",
  "do-not-use",
  "do_not_use",
];

function isWeakSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return WEAK_SECRET_SUBSTRINGS.some((marker) => lower.includes(marker));
}

const productionSecret = z
  .string()
  .min(32, "must be at least 32 characters")
  .refine((value) => !isWeakSecret(value), {
    message: "appears to be a placeholder value; rotate it before deploying",
  });

const devSecret = z.string().min(1);

const secretSchema = isProduction ? productionSecret : devSecret;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url("must be a valid database connection URL"),
  NEXTAUTH_URL: z.string().url("must be a valid URL"),
  NEXTAUTH_SECRET: secretSchema,
  YOUTUBE_API_KEY: z.string().min(1, "is required"),

  // Optional — absence is explicitly allowed.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  QUIZ_SESSION_SECRET: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  DISCOGS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join(".");
      return `  - ${path || "(root)"}: ${issue.message}`;
    })
    .join("\n");
}

// Loopback hosts are allowed over http even in production so that
// prod-mode local runs (next start) and CI e2e smoke tests work
// without TLS termination. Real public hostnames must use https.
function isLoopbackUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (parsed.success) {
    if (
      isProduction &&
      !parsed.data.NEXTAUTH_URL.startsWith("https://") &&
      !isLoopbackUrl(parsed.data.NEXTAUTH_URL)
    ) {
      throw new Error(
        `Invalid environment in production:\n  - NEXTAUTH_URL: must use https:// for non-loopback hosts (got ${parsed.data.NEXTAUTH_URL})`,
      );
    }
    return parsed.data;
  }

  const message = `Invalid environment:\n${formatIssues(parsed.error.issues)}`;

  if (isProduction) {
    throw new Error(message);
  }

  // In development and test, surface the issues but don't crash — the
  // developer likely knows something is missing and is iterating on it.
  console.warn(message);
  return parsed.data ?? (process.env as unknown as Env);
}

export const env = validateEnv();
