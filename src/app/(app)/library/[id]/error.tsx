"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { logClientError } from "@/lib/log-client-error";

export default function PlaylistDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError("library/[id]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <ErrorState
        message={
          process.env.NODE_ENV === "development"
            ? error.message
            : "We couldn't load this playlist. You can try again or return to your library."
        }
        onRetry={reset}
      />
      {error.digest && (
        <p className="mt-2 text-xs text-gray-500">Error ID: {error.digest}</p>
      )}
      <Link
        href="/library"
        className="mt-4 rounded-lg bg-lime-600 px-5 py-2.5 text-sm font-medium transition hover:bg-lime-500"
      >
        Back to library
      </Link>
    </div>
  );
}
