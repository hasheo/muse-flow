"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-[#04030c] text-white">
        <div className="mx-auto max-w-md px-6 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-sm text-gray-400">
            {process.env.NODE_ENV === "development"
              ? error.message
              : "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-gray-500">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/20"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
