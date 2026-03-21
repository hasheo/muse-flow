import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";

const playlistParamsSchema = z.object({
  id: z.string().cuid(),
});

function buildCloneName(name: string) {
  const suffix = " (copy)";
  const maxLength = 80;
  const trimmed = name.trim();
  if (!trimmed) {
    return "Quiz Playlist (copy)";
  }
  if (trimmed.length + suffix.length <= maxLength) {
    return `${trimmed}${suffix}`;
  }
  return `${trimmed.slice(0, maxLength - suffix.length)}${suffix}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = playlistParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "clone-playlist");
    if (rateLimited) {
      return rateLimited;
    }

    const { id } = parsedParams.data;
    const source = await db.playlist.findFirst({
      where: {
        id,
        isQuiz: true,
        isPublic: true,
      },
      include: {
        tracks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!source) {
      return apiError({
        status: 404,
        code: "NOT_FOUND",
        message: "Public quiz playlist not found",
      });
    }

    const cloneableTracks = source.tracks.filter(
      (track) => track.sourceType === "youtube" && Boolean(track.youtubeVideoId),
    );

    const cloned = await db.playlist.create({
      data: {
        name: buildCloneName(source.name),
        cover: source.cover,
        isQuiz: true,
        isPublic: false,
        difficulty: source.difficulty,
        answerMode: source.answerMode,
        userId: session.user.id,
        tracks: {
          create: cloneableTracks.map((track, index) => ({
            trackId: track.trackId,
            position: index,
            sourceType: "youtube",
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            cover: track.cover,
            youtubeVideoId: track.youtubeVideoId,
            mimeType: null,
            sourcePath: null,
            addedById: session.user.id,
          })),
        },
      },
      include: {
        _count: {
          select: { tracks: true },
        },
      },
    });

    return NextResponse.json(
      {
        playlist: {
          id: cloned.id,
          name: cloned.name,
          cover: cloned.cover,
          isQuiz: cloned.isQuiz,
          isPublic: cloned.isPublic,
          difficulty: cloned.difficulty,
          answerMode: cloned.answerMode,
          trackCount: cloned._count.tracks,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to clone playlist",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
