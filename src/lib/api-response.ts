import { NextResponse } from "next/server";
import type { ZodError } from "zod";

type ApiErrorOptions = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  headers?: HeadersInit;
};

export function apiError(options: ApiErrorOptions) {
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
