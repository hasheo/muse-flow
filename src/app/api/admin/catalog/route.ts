import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const ROUTE = "admin-catalog";

const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const catalogCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
    album: z.string().trim().max(200).optional().default(""),
    duration: z.number().int().min(1).max(60 * 60 * 6),
    cover: z.string().trim().url().max(1000),
    youtubeVideoId: z.string().trim().min(5).max(32),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    country: z.string().trim().max(60).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    genre: z.string().trim().max(60).nullable().optional(),
    musicbrainzId: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

function normalizeNullable(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(ROUTE);
  if (!auth.ok) return auth.response;

  const parsed = catalogQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_QUERY",
      message: "Invalid query",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const q = parsed.data.q?.trim() ?? "";
  const take = parsed.data.take ?? 100;

  const tracks = await db.catalogTrack.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { artist: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
            { genre: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take,
  });

  return NextResponse.json({ tracks });
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

  const parsed = catalogCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid catalog track",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const data = parsed.data;

  try {
    const track = await db.catalogTrack.create({
      data: {
        title: data.title,
        artist: data.artist,
        album: data.album ?? "",
        duration: data.duration,
        cover: data.cover,
        youtubeVideoId: data.youtubeVideoId,
        year: data.year ?? null,
        country: normalizeNullable(data.country),
        category: normalizeNullable(data.category),
        genre: normalizeNullable(data.genre),
        musicbrainzId: normalizeNullable(data.musicbrainzId),
        addedById: auth.context.userId,
      },
    });

    return NextResponse.json({ track }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint") || message.includes("P2002")) {
      return apiError({
        status: 409,
        code: "DUPLICATE",
        message: "A catalog track with that YouTube video already exists",
        log: { route: ROUTE, userId: auth.context.userId },
      });
    }
    return apiError({
      status: 500,
      code: "SERVER_ERROR",
      message: "Failed to create catalog track",
      log: { route: ROUTE, userId: auth.context.userId, cause: error },
    });
  }
}
