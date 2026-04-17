/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Importing `@/lib/env` here triggers Zod validation against `process.env`
 * at startup. In production this fails fast on missing/weak/placeholder
 * secrets so the deploy never serves traffic with a misconfigured app.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
