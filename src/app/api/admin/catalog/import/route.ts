import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";

const ROUTE = "admin-catalog-import";

const MAX_BATCH = 10;

const trackInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  album: z.string().trim().max(200).optional().default(""),
  duration: z.number().int().min(1).max(60 * 60 * 6),
  cover: z.string().trim().url().max(1000),
  youtubeVideoId: z.string().trim().min(5).max(32),
  category: z.string().trim().max(60).optional().nullable(),
});

const batchSchema = z
  .object({
    tracks: z.array(trackInputSchema).min(1).max(MAX_BATCH),
    enrich: z.boolean().optional().default(true),
  })
  .strict();

type ResultEntry = {
  youtubeVideoId: string;
  status: "created" | "duplicate" | "error";
  message?: string;
  trackId?: string;
};

function normalizeNullable(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid import batch",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const { tracks, enrich } = parsed.data;

  // Dedupe against existing catalog in one query rather than per-track.
  const existing = await db.catalogTrack.findMany({
    where: { youtubeVideoId: { in: tracks.map((t) => t.youtubeVideoId) } },
    select: { youtubeVideoId: true },
  });
  const existingSet = new Set(existing.map((t) => t.youtubeVideoId));

  const results: ResultEntry[] = [];

  // Sequential processing: MusicBrainz asks for ≤1 req/sec. A small delay
  // between tracks keeps us well within that and makes 429s rare. 10 tracks
  // with enrich ≈ 10 × ~1.3s ≈ 13s — below Vercel's 60s serverless limit.
  for (const track of tracks) {
    if (existingSet.has(track.youtubeVideoId)) {
      results.push({
        youtubeVideoId: track.youtubeVideoId,
        status: "duplicate",
        message: "Already in catalog",
      });
      continue;
    }

    let year: number | null = null;
    let country: string | null = null;
    let genre: string | null = null;
    let musicbrainzId: string | null = null;

    if (enrich) {
      try {
        const enrichment = await enrichTrackMetadata(track.title, track.artist);
        year = enrichment.year;
        country = enrichment.country;
        genre = enrichment.genre;
        musicbrainzId = enrichment.musicbrainzId;
      } catch {
        // Swallow enrichment failures — we still want to insert the track.
      }
    }

    try {
      const created = await db.catalogTrack.create({
        data: {
          title: track.title,
          artist: track.artist,
          album: track.album ?? "",
          duration: track.duration,
          cover: track.cover,
          youtubeVideoId: track.youtubeVideoId,
          year,
          country,
          category: normalizeNullable(track.category),
          genre,
          musicbrainzId,
          addedById: auth.context.userId,
        },
        select: { id: true },
      });
      results.push({
        youtubeVideoId: track.youtubeVideoId,
        status: "created",
        trackId: created.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("P2002")) {
        // Another request inserted it concurrently — treat as duplicate.
        results.push({
          youtubeVideoId: track.youtubeVideoId,
          status: "duplicate",
          message: "Already in catalog",
        });
      } else {
        results.push({
          youtubeVideoId: track.youtubeVideoId,
          status: "error",
          message: message.slice(0, 200),
        });
      }
    }

    // Tiny spacer between tracks when enriching to stay friendly to MB.
    if (enrich) await sleep(300);
  }

  return NextResponse.json({ results });
}
