/**
 * Structured logger for client-side render errors caught by Next.js
 * `error.tsx` boundaries. When Sentry (or equivalent) is wired up in
 * `instrumentation.ts`, route this through its capture function.
 */
export function logClientError(scope: string, error: Error & { digest?: string }) {
  if (typeof window === "undefined") {
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      scope,
      code: "CLIENT_RENDER_ERROR",
      name: error.name,
      message: error.message,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    }),
  );
}
