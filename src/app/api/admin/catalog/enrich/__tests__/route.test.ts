import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/metadata-enrichment", () => ({
  enrichTrackMetadata: vi.fn(),
}));

import { requireAdmin } from "@/lib/admin-auth";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";
import { checkRateLimit } from "@/lib/rate-limit";

import { POST } from "../route";

const ADMIN = { userId: "admin-1", email: "admin@example.com" };
const ALLOWED = { allowed: true, remaining: 29, resetAt: 0, retryAfterMs: 0 };

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/catalog/enrich", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true, context: ADMIN } as never);
  vi.mocked(checkRateLimit).mockResolvedValue(ALLOWED);
  vi.mocked(enrichTrackMetadata).mockResolvedValue({
    year: 2020,
    country: "JP",
    genre: null,
    musicbrainzId: null,
    confidence: 0.7,
    sources: ["musicbrainz"],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/catalog/enrich", () => {
  it("returns enrichment payload on the happy path", async () => {
    const res = await POST(jsonRequest({ title: "Lemon", artist: "Kenshi Yonezu" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrichment.country).toBe("JP");
    expect(checkRateLimit).toHaveBeenCalledWith(
      `admin-enrich:${ADMIN.userId}`,
      expect.objectContaining({ maxRequests: 30, windowMs: 60_000 }),
    );
  });

  it("returns 429 with Retry-After when the per-admin limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 12_500,
      retryAfterMs: 12_500,
    });

    const res = await POST(jsonRequest({ title: "Lemon", artist: "Kenshi Yonezu" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("13");
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
    // Crucially, we must short-circuit before calling MusicBrainz/Discogs.
    expect(enrichTrackMetadata).not.toHaveBeenCalled();
  });

  it("forwards admin-auth failures untouched", async () => {
    const failureResponse = new Response("nope", { status: 403 });
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: failureResponse as never,
    });
    const res = await POST(jsonRequest({ title: "x", artist: "y" }));
    expect(res.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies", async () => {
    const res = await POST(jsonRequest({ title: "", artist: "Artist" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_BODY");
  });

  it("returns 502 when the enrichment library throws", async () => {
    vi.mocked(enrichTrackMetadata).mockRejectedValue(new Error("upstream down"));
    const res = await POST(jsonRequest({ title: "Lemon", artist: "Kenshi Yonezu" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("ENRICHMENT_FAILED");
  });
});
