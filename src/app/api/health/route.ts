import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "HEALTH_DB_UNAVAILABLE",
        cause: error instanceof Error ? { name: error.name, message: error.message } : error,
        timestamp: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      {
        status: "error",
        db: "unavailable",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    db: "ok",
    latencyMs: Date.now() - startedAt,
  });
}
