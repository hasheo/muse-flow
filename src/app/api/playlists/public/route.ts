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

    const playlists = await db.playlist.findMany({
      where: {
        isQuiz: true,
        isPublic: true,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { tracks: true },
        },
      },
    });

    const userIds = [...new Set(playlists.map((playlist) => playlist.userId))];
    const users = await db.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    return NextResponse.json({
      playlists: playlists.map((playlist) => {
        const user = usersById.get(playlist.userId);
        return {
          id: playlist.id,
          name: playlist.name,
          cover: playlist.cover,
          isQuiz: playlist.isQuiz,
          isPublic: playlist.isPublic,
          difficulty: playlist.difficulty,
          answerMode: playlist.answerMode,
          ownerName: getUserDisplayName(user?.name, user?.email),
          trackCount: playlist._count.tracks,
          updatedAt: playlist.updatedAt,
        };
      }),
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch public playlists",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
