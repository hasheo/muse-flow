import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { extractPlaylistId, fetchPlaylistTracks } from "@/lib/youtube-playlist";

const ROUTE = "admin-catalog-import-preview";

const previewSchema = z
  .object({
    playlistUrl: z.string().trim().min(1).max(500),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(ROUTE);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid JSON body",
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid preview request",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const playlistId = extractPlaylistId(parsed.data.playlistUrl);
  if (!playlistId) {
    return apiError({
      status: 400,
      code: "INVALID_PLAYLIST",
      message: "Could not parse a playlist ID from that URL",
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  try {
    const videos = await fetchPlaylistTracks(playlistId);

    if (videos.length === 0) {
      return NextResponse.json({ playlistId, tracks: [] });
    }

    const existing = await db.catalogTrack.findMany({
      where: { youtubeVideoId: { in: videos.map((v) => v.youtubeVideoId) } },
      select: { youtubeVideoId: true },
    });
    const existingSet = new Set(existing.map((t) => t.youtubeVideoId));

    const tracks = videos.map((video) => ({
      ...video,
      alreadyInCatalog: existingSet.has(video.youtubeVideoId),
    }));

    return NextResponse.json({ playlistId, tracks });
  } catch (error) {
    return apiError({
      status: 502,
      code: "UPSTREAM_ERROR",
      message: "Failed to fetch playlist from YouTube Music",
      log: { route: ROUTE, userId: auth.context.userId, cause: error },
    });
  }
}
