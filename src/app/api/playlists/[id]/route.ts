import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import type { Track } from "@/lib/catalog";
import { db } from "@/lib/db";
import { DEFAULT_PLAYLIST_COVER } from "@/lib/playlist";
import { QUIZ_DIFFICULTY_VALUES } from "@/lib/quiz-difficulty";
import { QUIZ_ANSWER_MODE_VALUES } from "@/lib/quiz-answer-mode";
import { createQuizSessionToken } from "@/lib/quiz-session";
import { getUserDisplayName } from "@/lib/user-display";

const playlistParamsSchema = z.object({
  id: z.string().cuid(),
});

const updatePlaylistSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    cover: z.string().trim().url().optional(),
    isQuiz: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    difficulty: z.enum(QUIZ_DIFFICULTY_VALUES).optional(),
    answerMode: z.enum(QUIZ_ANSWER_MODE_VALUES).optional(),
  })
  .strict();

function cleanYouTubeMetadata(rawTitle: string, rawArtist: string, rawAlbum: string) {
  const artist = rawArtist.replace(/\s*-\s*Topic$/, "");
  const album = rawAlbum === "YouTube Music" ? "" : rawAlbum.replace(/\s*-\s*Topic$/, "");

  // Try to parse "Artist - Title" format from video title
  const separatorMatch = rawTitle.match(/^(.+?)\s*[-–—]\s+(.+)$/);
  if (separatorMatch) {
    return {
      title: separatorMatch[2].trim(),
      artist: separatorMatch[1].trim(),
      album: album || artist,
    };
  }

  return { title: rawTitle, artist, album };
}

function mapPlaylistTrackToTrack(track: {
  trackId: string;
  sourceType: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  youtubeVideoId: string | null;
  addedBy?: { id: string; name: string | null; image: string | null } | null;
}): (Track & { addedBy?: { id: string; name: string | null; image: string | null } | null }) | null {
  if (track.sourceType !== "youtube" || !track.youtubeVideoId) {
    return null;
  }

  const cleaned = cleanYouTubeMetadata(track.title, track.artist, track.album);

  return {
    id: track.trackId,
    sourceType: "youtube",
    youtubeVideoId: track.youtubeVideoId,
    title: cleaned.title,
    artist: cleaned.artist,
    album: cleaned.album,
    duration: track.duration,
    cover: track.cover,
    addedBy: track.addedBy,
  };
}

export async function GET(
  _request: Request,
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

    const { id } = parsedParams.data;
    const playlist = await db.playlist.findFirst({
      where: { id },
      include: {
        tracks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            trackId: true,
            sourceType: true,
            title: true,
            artist: true,
            album: true,
            duration: true,
            cover: true,
            youtubeVideoId: true,
            addedById: true,
            addedBy: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    let role: "owner" | "collaborator" | null = null;
    if (playlist.userId === session.user.id) {
      role = "owner";
    } else {
      const collaborator = await db.playlistCollaborator.findUnique({
        where: {
          playlistId_userId: { playlistId: id, userId: session.user.id },
        },
      });
      if (collaborator) {
        role = "collaborator";
      }
    }

    if (!role && !(playlist.isQuiz && playlist.isPublic)) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const owner = await db.user.findUnique({
      where: {
        id: playlist.userId,
      },
      select: {
        name: true,
        email: true,
      },
    });

    const tracks = playlist.tracks
      .map((track) =>
        mapPlaylistTrackToTrack({
          trackId: track.trackId,
          sourceType: track.sourceType,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          cover: track.cover,
          youtubeVideoId: track.youtubeVideoId,
          addedBy: track.addedBy,
        }),
      )
      .filter((track): track is Track & { addedBy?: { id: string; name: string | null; image: string | null } | null } => Boolean(track));

    return NextResponse.json({
      playlist: {
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover,
        isQuiz: playlist.isQuiz,
        isPublic: playlist.isPublic,
        difficulty: playlist.difficulty,
        answerMode: playlist.answerMode,
        ownerName: getUserDisplayName(owner?.name, owner?.email),
        trackCount: tracks.length,
        role: role || "viewer",
      },
      tracks,
      quizSessionToken: playlist.isQuiz
        ? createQuizSessionToken({
            userId: session.user.id,
            playlistId: playlist.id,
            trackIds: tracks.map((track) => track.id),
          })
        : null,
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch playlist",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function PATCH(
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

    const { id } = parsedParams.data;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "update-playlist");
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

    const parsed = updatePlaylistSchema.safeParse(body);
    if (
      !parsed.success ||
      (parsed.data.name === undefined &&
        parsed.data.cover === undefined &&
        parsed.data.isQuiz === undefined &&
        parsed.data.isPublic === undefined &&
        parsed.data.difficulty === undefined &&
        parsed.data.answerMode === undefined)
    ) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist payload",
        details: parsed.success ? undefined : zodErrorDetails(parsed.error),
      });
    }

    const updated = await db.playlist.update({
      where: { id },
      data: {
        name: parsed.data.name,
        cover: parsed.data.cover === undefined ? undefined : parsed.data.cover || DEFAULT_PLAYLIST_COVER,
        isQuiz: parsed.data.isQuiz,
        isPublic: parsed.data.isPublic,
        difficulty: parsed.data.difficulty,
        answerMode: parsed.data.answerMode,
      },
    });

    return NextResponse.json({
      playlist: {
        id: updated.id,
        name: updated.name,
        cover: updated.cover,
        isQuiz: updated.isQuiz,
        isPublic: updated.isPublic,
        difficulty: updated.difficulty,
        answerMode: updated.answerMode,
      },
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update playlist",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function DELETE(
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

    const { id } = parsedParams.data;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "delete-playlist");
    if (rateLimited) {
      return rateLimited;
    }

    await db.playlist.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Playlist deleted" });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete playlist",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
