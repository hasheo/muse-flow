import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { apiError } from "@/lib/api-response";
import { authOptions } from "@/lib/auth";
import { listCatalogCategories, slugifyCategory } from "@/lib/survival-catalog";

const ROUTE = "quiz-categories";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Sign in required",
      log: { route: ROUTE },
    });
  }

  const rows = await listCatalogCategories();
  const categories = rows.map((row) => ({
    name: row.category,
    slug: slugifyCategory(row.category),
    count: row.count,
  }));

  return NextResponse.json({ categories });
}
