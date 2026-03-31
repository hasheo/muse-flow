"use client";

import Link from "next/link";

import { ErrorState } from "@/components/ui/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <ErrorState
        message={
          process.env.NODE_ENV === "development"
            ? error.message
            : "This page ran into an error. You can try again or go back home."
        }
        onRetry={reset}
      />
      {error.digest && (
        <p className="mt-2 text-xs text-gray-500">
          Error ID: {error.digest}
        </p>
      )}
      <Link
        href="/app"
        className="mt-4 rounded-lg bg-lime-600 px-5 py-2.5 text-sm font-medium transition hover:bg-lime-500"
      >
        Go home
      </Link>
    </div>
  );
}
