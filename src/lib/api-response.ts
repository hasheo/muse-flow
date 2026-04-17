import { NextResponse } from "next/server";
import type { ZodError } from "zod";

type ApiErrorOptions = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  headers?: HeadersInit;
  /** Optional context for structured logging (route, userId, cause). */
  log?: {
    route?: string;
    userId?: string | null;
    cause?: unknown;
  };
};

function logApiError(options: ApiErrorOptions) {
  if (options.status < 500 && !options.log?.cause) {
    // Client-side (4xx) errors without an unexpected cause are expected
    // behavior. Skip logging to avoid noise.
    return;
  }

  const entry = {
    level: options.status >= 500 ? "error" : "warn",
    code: options.code,
    status: options.status,
    route: options.log?.route,
    userId: options.log?.userId ?? undefined,
    cause:
      options.log?.cause instanceof Error
        ? { name: options.log.cause.name, message: options.log.cause.message, stack: options.log.cause.stack }
        : options.log?.cause,
    timestamp: new Date().toISOString(),
  };

  if (entry.level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.warn(JSON.stringify(entry));
  }
}

export function apiError(options: ApiErrorOptions) {
  logApiError(options);

  const body: { code: string; message: string; details?: unknown } = {
    code: options.code,
    message: options.message,
  };

  if (options.details !== undefined) {
    body.details = options.details;
  }

  return NextResponse.json(body, {
    status: options.status,
    headers: options.headers,
  });
}

export function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join("."),
    message: issue.message,
  }));
}
