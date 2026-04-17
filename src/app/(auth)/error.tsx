"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { logClientError } from "@/lib/log-client-error";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError("auth", error);
  }, [error]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(156,255,67,0.25),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.25),transparent_45%),linear-gradient(180deg,#04030c_0%,#111827_100%)]" />
      <div className="relative z-10 text-center">
        <ErrorState
          message={
            process.env.NODE_ENV === "development"
              ? error.message
              : "An error occurred. Please try again."
          }
          onRetry={reset}
        />
        {error.digest && (
          <p className="mt-2 text-xs text-gray-500">
            Error ID: {error.digest}
          </p>
        )}
        <Link
          href="/sign-in"
          className="mt-4 inline-block rounded-lg bg-lime-600 px-5 py-2.5 text-sm font-medium transition hover:bg-lime-500"
        >
          Go to sign-in
        </Link>
      </div>
    </main>
  );
}
