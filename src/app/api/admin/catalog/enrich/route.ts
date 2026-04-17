import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";

const ROUTE = "admin-catalog-enrich";

const enrichSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
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
