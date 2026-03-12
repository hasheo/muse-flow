import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import type { Track } from "@/lib/catalog";
import { db } from "@/lib/db";

const playlistParamsSchema = z.object({
  id: z.string().cuid(),
});

const trackSchema = z
  .object({
    id: z.string().min(1),
    sourceType: z.literal("youtube"),
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string(),
    duration: z.number().int().nonnegative(),
    cover: z.string(),
    youtubeVideoId: z.string().min(1),
  })
  .strict();

const addTrackSchema = z
  .object({
    track: trackSchema,
  })
  .strict();

const deleteTrackSchema = z
  .object({
    trackId: z.string().min(1),
  })
  .strict();

const reorderTracksSchema = z
  .object({
    trackIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .refine((value) => new Set(value.trackIds).size === value.trackIds.length, {
    message: "Track ids must be unique",
    path: ["trackIds"],
  });

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
    const { id: playlistId } = parsedParams.data;

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "add-track");
    if (rateLimited) {
      return rateLimited;
    }

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
    }

    const parsed = addTrackSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid track payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const track: Track = parsed.data.track;
    const lastTrack = await db.playlistTrack.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (lastTrack?.position ?? -1) + 1;

    const savedTrack = await db.playlistTrack.upsert({
      where: {
        playlistId_trackId: {
          playlistId,
          trackId: track.id,
        },
      },
      update: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        cover: track.cover,
        sourceType: "youtube",
        youtubeVideoId: track.youtubeVideoId,
        mimeType: null,
        sourcePath: null,
      },
      create: {
        playlistId,
        trackId: track.id,
        position: nextPosition,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        cover: track.cover,
        sourceType: "youtube",
        youtubeVideoId: track.youtubeVideoId,
        mimeType: null,
        sourcePath: null,
      },
    });

    await db.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      message: "Track saved to playlist",
      playlistTrackId: savedTrack.id,
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to save track",
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
    const { id: playlistId } = parsedParams.data;

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "remove-track");
    if (rateLimited) {
      return rateLimited;
    }

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
    }

    const parsed = deleteTrackSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid track payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const { trackId } = parsed.data;

    await db.playlistTrack.deleteMany({
      where: {
        playlistId,
        trackId,
      },
    });

    const remaining = await db.playlistTrack.findMany({
      where: { playlistId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    await db.$transaction(
      remaining.map((item, index) =>
        db.playlistTrack.update({
          where: { id: item.id },
          data: { position: index },
        }),
      ),
    );

    await db.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message: "Track removed from playlist" });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete track",
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
    const { id: playlistId } = parsedParams.data;

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "reorder-tracks");
    if (rateLimited) {
      return rateLimited;
    }

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
    }

    const parsed = reorderTracksSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid reorder payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const trackIds = parsed.data.trackIds;
    const existingTracks = await db.playlistTrack.findMany({
      where: { playlistId },
      select: { trackId: true },
    });

    if (existingTracks.length !== trackIds.length) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Track count mismatch",
      });
    }

    const existingSet = new Set(existingTracks.map((item) => item.trackId));
    const inputSet = new Set(trackIds);
    if (existingSet.size !== inputSet.size || [...existingSet].some((id) => !inputSet.has(id))) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Track list mismatch",
      });
    }

    await db.$transaction(
      trackIds.map((trackId, index) =>
        db.playlistTrack.update({
          where: { playlistId_trackId: { playlistId, trackId } },
          data: { position: index },
        }),
      ),
    );

    await db.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message: "Playlist reordered" });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to reorder tracks",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
