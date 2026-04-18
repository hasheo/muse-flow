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
vi.mock("@/lib/db", () => ({
  db: {
    catalogTrack: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { enrichTrackMetadata } from "@/lib/metadata-enrichment";
import { checkRateLimit } from "@/lib/rate-limit";

import { POST } from "../route";

const ADMIN = { userId: "admin-1", email: "admin@example.com" };
const ALLOWED = { allowed: true, remaining: 29, resetAt: 0, retryAfterMs: 0 };

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/catalog/bulk-update", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true, context: ADMIN } as never);
  vi.mocked(checkRateLimit).mockResolvedValue(ALLOWED);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/catalog/bulk-update", () => {
  it("applies a category patch in one updateMany call when not enriching", async () => {
    vi.mocked(db.catalogTrack.updateMany).mockResolvedValue({ count: 3 } as never);

    const res = await POST(
      jsonRequest({
        ids: ["a", "b", "c"],
        patch: { category: "Anime OST" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);
    expect(db.catalogTrack.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b", "c"] } },
      data: { category: "Anime OST" },
    });
    // Pure DB update must not pull from external APIs nor consume the rate budget.
    expect(enrichTrackMetadata).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects an empty patch when not enriching", async () => {
    const res = await POST(jsonRequest({ ids: ["a"], patch: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("EMPTY_PATCH");
    expect(db.catalogTrack.updateMany).not.toHaveBeenCalled();
  });

  it("re-enriches each track and applies explicit patch with priority", async () => {
    vi.mocked(db.catalogTrack.findMany).mockResolvedValue([
      { id: "t1", title: "Lemon", artist: "Kenshi Yonezu" },
      { id: "t2", title: "Pretender", artist: "Official Hige Dandism" },
    ] as never);
    vi.mocked(db.catalogTrack.update).mockResolvedValue({} as never);
    vi.mocked(enrichTrackMetadata).mockResolvedValue({
      year: 2018,
      country: "JP",
      genre: "J-Pop",
      musicbrainzId: "mb-1",
      confidence: 0.7,
      sources: ["musicbrainz"],
    });

    const res = await POST(
      jsonRequest({
        ids: ["t1", "t2"],
        patch: { category: "J-Pop hits", year: 1999 },
        enrich: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);
    expect(enrichTrackMetadata).toHaveBeenCalledTimes(2);

    // Explicit patch wins — year stays 1999 even though enrichment returned 2018.
    // Country/genre come from enrichment because the admin didn't set them.
    const firstUpdate = vi.mocked(db.catalogTrack.update).mock.calls[0][0];
    expect(firstUpdate.where).toEqual({ id: "t1" });
    expect(firstUpdate.data).toMatchObject({
      category: "J-Pop hits",
      year: 1999,
      country: "JP",
      genre: "J-Pop",
      musicbrainzId: "mb-1",
    });
  });

  it("returns 429 when the per-admin enrich budget is spent", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 5_000,
      retryAfterMs: 5_000,
    });

    const res = await POST(
      jsonRequest({ ids: ["t1"], patch: { category: "X" }, enrich: true }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(enrichTrackMetadata).not.toHaveBeenCalled();
    expect(db.catalogTrack.update).not.toHaveBeenCalled();
  });

  it("rejects enrich batches larger than 10", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `t${i}`);
    const res = await POST(
      jsonRequest({ ids, patch: { category: "X" }, enrich: true }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BATCH_TOO_LARGE");
    expect(db.catalogTrack.findMany).not.toHaveBeenCalled();
  });

  it("forwards admin-auth failures", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: new Response("forbidden", { status: 403 }) as never,
    });
    const res = await POST(jsonRequest({ ids: ["t1"], patch: { category: "X" } }));
    expect(res.status).toBe(403);
    expect(db.catalogTrack.updateMany).not.toHaveBeenCalled();
  });

  it("survives an enrichment failure on one track without aborting the batch", async () => {
    vi.mocked(db.catalogTrack.findMany).mockResolvedValue([
      { id: "t1", title: "A", artist: "X" },
      { id: "t2", title: "B", artist: "Y" },
    ] as never);
    vi.mocked(db.catalogTrack.update).mockResolvedValue({} as never);
    vi.mocked(enrichTrackMetadata)
      .mockRejectedValueOnce(new Error("MB down"))
      .mockResolvedValueOnce({
        year: 2010,
        country: null,
        genre: "Rock",
        musicbrainzId: null,
        confidence: 0.7,
        sources: ["musicbrainz"],
      });

    const res = await POST(
      jsonRequest({ ids: ["t1", "t2"], patch: { category: "Hits" }, enrich: true }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);
    // Both tracks still got the category patch applied.
    expect(db.catalogTrack.update).toHaveBeenCalledTimes(2);
  });
});
