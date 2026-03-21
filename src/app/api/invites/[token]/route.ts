import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { db } from "@/lib/db";

const tokenParamsSchema = z.object({
  token: z.string().min(1),
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = tokenParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
      });
    }

    const { token } = parsedParams.data;
    const invite = await db.playlistInvite.findUnique({
      where: { token },
    });

    if (!invite || invite.used) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Invite not found" });
    }

    // For email invites, declining user's email must match
    if (invite.type === "email") {
      if (session.user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
        return apiError({
          status: 403,
          code: "EMAIL_MISMATCH",
          message: "This invite was sent to a different email address",
        });
      }
    }

    await db.playlistInvite.update({
      where: { id: invite.id },
      data: { used: true },
    });

    return NextResponse.json({ message: "Invite declined" });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to decline invite",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
