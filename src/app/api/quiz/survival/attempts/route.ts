import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { apiError } from "@/lib/api-response";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const ROUTE = "quiz-survival-attempts";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError({ status: 401, code: "UNAUTHENTICATED", message: "Sign in required", log: { route: ROUTE } });
  }

  const attempts = await db.survivalAttempt.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const best = attempts.reduce<number>((max, attempt) => (attempt.score > max ? attempt.score : max), 0);

  return NextResponse.json({ attempts, best });
}
