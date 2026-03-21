import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getUserDisplayName } from "@/lib/user-display";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json([]);
    }

    const now = new Date();

    const invites = await db.playlistInvite.findMany({
      where: {
        type: "email",
        email,
        used: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
            cover: true,
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = invites.map((invite) => ({
      id: invite.id,
      token: invite.token,
      createdAt: invite.createdAt,
      playlist: {
        id: invite.playlist.id,
        name: invite.playlist.name,
        cover: invite.playlist.cover,
        ownerName: getUserDisplayName(invite.playlist.user.name, invite.playlist.user.email),
      },
    }));

    return NextResponse.json(result);
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch pending invites",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
