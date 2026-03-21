import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";
import { DEFAULT_PLAYLIST_COVER } from "@/lib/playlist";
import { DEFAULT_QUIZ_DIFFICULTY, QUIZ_DIFFICULTY_VALUES } from "@/lib/quiz-difficulty";
import { DEFAULT_QUIZ_ANSWER_MODE, QUIZ_ANSWER_MODE_VALUES } from "@/lib/quiz-answer-mode";

const createPlaylistSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    cover: z.string().trim().url().optional(),
    isQuiz: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    difficulty: z.enum(QUIZ_DIFFICULTY_VALUES).optional(),
    answerMode: z.enum(QUIZ_ANSWER_MODE_VALUES).optional(),
  })
  .strict();

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

    const [ownedPlaylists, collaborations] = await Promise.all([
      db.playlist.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: { tracks: true },
          },
        },
      }),
      db.playlistCollaborator.findMany({
        where: { userId: session.user.id },
        include: {
          playlist: {
            include: {
              _count: {
                select: { tracks: true },
              },
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
        orderBy: { playlist: { updatedAt: "desc" } },
      }),
    ]);

    const owned = ownedPlaylists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      cover: playlist.cover,
      isQuiz: playlist.isQuiz,
      isPublic: playlist.isPublic,
      difficulty: playlist.difficulty,
      answerMode: playlist.answerMode,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      trackCount: playlist._count.tracks,
      role: "owner" as const,
    }));

    const collaborative = collaborations.map((collab) => ({
      id: collab.playlist.id,
      name: collab.playlist.name,
      cover: collab.playlist.cover,
      isQuiz: collab.playlist.isQuiz,
      isPublic: collab.playlist.isPublic,
      difficulty: collab.playlist.difficulty,
      answerMode: collab.playlist.answerMode,
      createdAt: collab.playlist.createdAt,
      updatedAt: collab.playlist.updatedAt,
      trackCount: collab.playlist._count.tracks,
      role: "collaborator" as const,
      ownerName:
        collab.playlist.user.name?.trim() ||
        collab.playlist.user.email?.split("@")[0] ||
        "Unknown",
    }));

    return NextResponse.json({
      playlists: [...owned, ...collaborative],
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch playlists",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "create-playlist");
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
    }

    const parsed = createPlaylistSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const playlist = await db.playlist.create({
      data: {
        name: parsed.data.name,
        cover: parsed.data.cover || DEFAULT_PLAYLIST_COVER,
        isQuiz: parsed.data.isQuiz ?? false,
        isPublic: parsed.data.isPublic ?? false,
        difficulty: parsed.data.difficulty ?? DEFAULT_QUIZ_DIFFICULTY,
        answerMode: parsed.data.answerMode ?? DEFAULT_QUIZ_ANSWER_MODE,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      {
        playlist: {
          id: playlist.id,
          name: playlist.name,
          cover: playlist.cover,
          isQuiz: playlist.isQuiz,
          isPublic: playlist.isPublic,
          difficulty: playlist.difficulty,
          answerMode: playlist.answerMode,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          trackCount: 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create playlist",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
