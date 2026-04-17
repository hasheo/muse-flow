import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const ROUTE = "admin-catalog-item";

const catalogUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    artist: z.string().trim().min(1).max(200).optional(),
    album: z.string().trim().max(200).optional(),
    duration: z.number().int().min(1).max(60 * 60 * 6).optional(),
    cover: z.string().trim().url().max(1000).optional(),
    youtubeVideoId: z.string().trim().min(5).max(32).optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    country: z.string().trim().max(60).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    genre: z.string().trim().max(60).nullable().optional(),
    musicbrainzId: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(ROUTE);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Missing track id", log: { route: ROUTE } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: "INVALID_BODY", message: "Invalid JSON body", log: { route: ROUTE } });
  }

  const parsed = catalogUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid update payload",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  const data = parsed.data;

  try {
    const track = await db.catalogTrack.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.artist !== undefined ? { artist: data.artist } : {}),
        ...(data.album !== undefined ? { album: data.album } : {}),
        ...(data.duration !== undefined ? { duration: data.duration } : {}),
        ...(data.cover !== undefined ? { cover: data.cover } : {}),
        ...(data.youtubeVideoId !== undefined ? { youtubeVideoId: data.youtubeVideoId } : {}),
        ...(data.year !== undefined ? { year: data.year } : {}),
        ...("country" in data ? { country: normalizeNullable(data.country) } : {}),
        ...("category" in data ? { category: normalizeNullable(data.category) } : {}),
        ...("genre" in data ? { genre: normalizeNullable(data.genre) } : {}),
        ...("musicbrainzId" in data ? { musicbrainzId: normalizeNullable(data.musicbrainzId) } : {}),
      },
    });
    return NextResponse.json({ track });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("P2025")) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Catalog track not found", log: { route: ROUTE } });
    }
    if (message.includes("P2002")) {
      return apiError({ status: 409, code: "DUPLICATE", message: "Another catalog track already uses that YouTube video", log: { route: ROUTE } });
    }
    return apiError({
      status: 500,
      code: "SERVER_ERROR",
      message: "Failed to update catalog track",
      log: { route: ROUTE, userId: auth.context.userId, cause: error },
    });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(ROUTE);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Missing track id", log: { route: ROUTE } });
  }

  try {
    await db.catalogTrack.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("P2025")) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Catalog track not found", log: { route: ROUTE } });
    }
    return apiError({
      status: 500,
      code: "SERVER_ERROR",
      message: "Failed to delete catalog track",
      log: { route: ROUTE, userId: auth.context.userId, cause: error },
    });
  }
}
