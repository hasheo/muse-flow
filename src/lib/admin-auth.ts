import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { db } from "@/lib/db";

export type AdminContext = {
  userId: string;
  email: string | null;
};

export async function requireAdmin(route: string): Promise<
  | { ok: true; context: AdminContext }
  | { ok: false; response: ReturnType<typeof apiError> }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: apiError({
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Sign in required",
        log: { route },
      }),
    };
  }

  // Re-check the DB rather than trusting JWT claims alone. isAdmin in the
  // token is a convenience for client UI; the ground truth lives in the DB.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, email: true },
  });

  if (!user?.isAdmin) {
    return {
      ok: false,
      response: apiError({
        status: 403,
        code: "FORBIDDEN",
        message: "Admin access required",
        log: { route, userId: session.user.id },
      }),
    };
  }

  return { ok: true, context: { userId: session.user.id, email: user.email } };
}
