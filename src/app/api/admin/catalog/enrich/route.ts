import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";
import { checkRateLimit } from "@/lib/rate-limit";

const ROUTE = "admin-catalog-enrich";

// MusicBrainz asks for ≤1 req/sec; Discogs is more generous. A single admin
// firing the "Auto-enrich" button manually never approaches this, but a stuck
// retry loop or a malicious script could. Cap each admin to 30 lookups/min,
// which leaves headroom for genuine UI use while protecting upstream quotas.
const ENRICH_WINDOW_MS = 60_000;
const ENRICH_MAX_PER_WINDOW = 30;

const enrichSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(ROUTE);
  if (!auth.ok) return auth.response;

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

  const parsed = enrichSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid enrichment request",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: auth.context.userId },
    });
  }

  try {
    const enrichment = await enrichTrackMetadata(parsed.data.title, parsed.data.artist);
    return NextResponse.json({ enrichment });
  } catch (error) {
    return apiError({
      status: 502,
      code: "ENRICHMENT_FAILED",
      message: "Metadata lookup failed",
      log: { route: ROUTE, userId: auth.context.userId, cause: error },
    });
  }
}
