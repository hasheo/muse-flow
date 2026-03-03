import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { tracks } from "@/lib/catalog";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    return NextResponse.json({ tracks });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch tracks",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
