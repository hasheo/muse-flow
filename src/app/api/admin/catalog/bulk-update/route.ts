import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";
import { checkRateLimit } from "@/lib/rate-limit";

const ROUTE = "admin-catalog-bulk-update";

// Plain field-set updates touch the DB only and are cheap, so we allow a wider
// batch. Re-enriching pulls from MusicBrainz/Discogs at ~1.3s/track and must
// stay under serverless timeouts, so we cap it tighter and let the client
// chunk larger selections.
const MAX_BATCH_PLAIN = 50;
const MAX_BATCH_ENRICH = 10;

// Mirror the admin-enrich rate limit so admins can't bypass it by routing
// requests through this endpoint instead.
const ENRICH_WINDOW_MS = 60_000;
const ENRICH_MAX_PER_WINDOW = 30;

const patchSchema = z
  .object({
    category: z.string().trim().min(1).max(60).optional(),
    country: z.string().trim().min(1).max(60).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    genre: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const bodySchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_BATCH_PLAIN),
    patch: patchSchema,
    enrich: z.boolean().optional().default(false),
  })
  .strict();

type ResultEntry = {
  id: string;
  status: "updated" | "skipped" | "error";
  message?: string;
};

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid bulk update payload",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const { ids, patch, enrich } = parsed.data;

  const patchKeys = Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined);
  if (!enrich && patchKeys.length === 0) {
    return apiError({
      status: 400,
      code: "EMPTY_PATCH",
      message: "Nothing to update — provide at least one field or set enrich=true",
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  if (enrich && ids.length > MAX_BATCH_ENRICH) {
    return apiError({
      status: 400,
      code: "BATCH_TOO_LARGE",
      message: `Re-enrich batches are capped at ${MAX_BATCH_ENRICH} tracks. Send smaller chunks.`,
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  // Fast path: just apply the same field values to every selected track.
  if (!enrich) {
    try {
      const result = await db.catalogTrack.updateMany({
        where: { id: { in: ids } },
        data: patch,
      });
      return NextResponse.json({
        updated: result.count,
        skipped: ids.length - result.count,
        results: ids.map<ResultEntry>((id) => ({ id, status: "updated" })),
      });
    } catch (error) {
      return apiError({
        status: 500,
        code: "SERVER_ERROR",
        message: "Bulk update failed",
        log: { route: ROUTE, userId: auth.context.userId, cause: error },
      });
    }
  }

  // Slow path: re-pull metadata from MusicBrainz/Discogs per track. Subject
  // to the same per-admin enrichment rate limit as the single-track endpoint.
  const rateLimit = await checkRateLimit(`admin-enrich:${auth.context.userId}`, {
    windowMs: ENRICH_WINDOW_MS,
    maxRequests: ENRICH_MAX_PER_WINDOW,
  });
  if (!rateLimit.allowed) {
    return apiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many enrichment requests. Please slow down.",
      details: { retryAfterMs: rateLimit.retryAfterMs },
      headers: {
        "Retry-After": Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
      },
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const tracks = await db.catalogTrack.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, artist: true },
  });
  const byId = new Map(tracks.map((t) => [t.id, t]));

  const results: ResultEntry[] = [];

  for (const id of ids) {
    const track = byId.get(id);
    if (!track) {
      results.push({ id, status: "skipped", message: "Track not found" });
      continue;
    }

    let enrichedYear: number | null = null;
    let enrichedCountry: string | null = null;
    let enrichedGenre: string | null = null;
    let enrichedMusicbrainzId: string | null = null;

    try {
      const enrichment = await enrichTrackMetadata(track.title, track.artist);
      enrichedYear = enrichment.year;
      enrichedCountry = enrichment.country;
      enrichedGenre = enrichment.genre;
      enrichedMusicbrainzId = enrichment.musicbrainzId;
    } catch {
      // Swallow upstream errors so one bad track doesn't kill the batch.
      // The track still gets the explicit patch applied below.
    }

    // Explicit patch always wins over enrichment. Enrichment only fills
    // fields the admin didn't explicitly set in this request.
    const updateData: Record<string, unknown> = {};
    if (patch.category !== undefined) updateData.category = patch.category;
    if (patch.country !== undefined) updateData.country = patch.country;
    else if (enrichedCountry !== null) updateData.country = enrichedCountry;
    if (patch.year !== undefined) updateData.year = patch.year;
    else if (enrichedYear !== null) updateData.year = enrichedYear;
    if (patch.genre !== undefined) updateData.genre = patch.genre;
    else if (enrichedGenre !== null) updateData.genre = enrichedGenre;
    if (enrichedMusicbrainzId !== null) updateData.musicbrainzId = enrichedMusicbrainzId;

    try {
      await db.catalogTrack.update({ where: { id }, data: updateData });
      results.push({ id, status: "updated" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id, status: "error", message: message.slice(0, 200) });
    }

    // Stay friendly to MusicBrainz between tracks.
    await sleep(300);
  }

  return NextResponse.json({
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
