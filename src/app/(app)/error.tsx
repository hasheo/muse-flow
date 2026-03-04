"use client";

import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="mt-3 max-w-sm text-sm text-gray-400">
        {process.env.NODE_ENV === "development"
          ? error.message
          : "This page ran into an error. You can try again or go back home."}
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-gray-500">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/20"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="rounded-lg bg-lime-600 px-5 py-2.5 text-sm font-medium transition hover:bg-lime-500"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
