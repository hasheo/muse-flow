"use client";

import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(156,255,67,0.25),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.25),transparent_45%),linear-gradient(180deg,#04030c_0%,#111827_100%)]" />
      <div className="relative z-10 text-center">
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="mt-3 max-w-sm text-sm text-gray-400">
          {process.env.NODE_ENV === "development"
            ? error.message
            : "An error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-gray-500">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/20"
          >
            Try again
          </button>
          <Link
            href="/sign-in"
            className="rounded-lg bg-lime-600 px-5 py-2.5 text-sm font-medium transition hover:bg-lime-500"
          >
            Go to sign-in
          </Link>
        </div>
      </div>
    </main>
  );
}
