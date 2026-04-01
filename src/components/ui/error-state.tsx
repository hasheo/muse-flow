import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
};

function ErrorState({
  message = "Something went wrong",
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-red-300", className)} role="alert">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
        {onRetry ? (
          <button
            className="ml-1 underline underline-offset-2 transition hover:text-red-200"
            onClick={onRetry}
            type="button"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-2xl border border-white/10 bg-black/35 p-8 text-center", className)}
      role="alert"
    >
      <div className="mb-3 flex justify-center text-red-400">
        <AlertCircle className="h-10 w-10" />
      </div>
      <p className="text-lg font-semibold text-white">{message}</p>
      {onRetry ? (
        <div className="mt-5">
          <Button onClick={onRetry} variant="ghost">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { ErrorState };
export type { ErrorStateProps };
