import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 49, resetAt: 0, retryAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
// Force YTMusic to always fail so tests exercise the YouTube Data API fallback path.
vi.mock("ytmusic-api", () => ({
  default: class {
    initialize() { return Promise.reject(new Error("YTMusic unavailable in test")); }
    searchSongs() { return Promise.reject(new Error("YTMusic unavailable in test")); }
  },
}));

import { getServerSession } from "next-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { GET } from "../route";

const TEST_USER_ID = "cltestuserid000000000001";
const mockSession = {
  user: { id: TEST_USER_ID, name: "Test User", email: "test@example.com" },
};

const makeSearchResponse = (videoIds: string[]) => ({
  items: videoIds.map((id) => ({
    id: { videoId: id },
    snippet: {
      title: `Song ${id}`,
      channelTitle: "Artist Name",
      thumbnails: { high: { url: `https://img.youtube.com/vi/${id}/hqdefault.jpg` } },
    },
  })),
  nextPageToken: undefined,
});

const makeDetailsResponse = (videoIds: string[]) => ({
  items: videoIds.map((id) => ({
    id,
    contentDetails: { duration: "PT3M30S" },
  })),
});

describe("GET /api/youtube/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    // Reset rate-limit mock to "allowed" after each test — clearAllMocks only clears
    // call history, not mock implementations set via .mockResolvedValue().
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 49, resetAt: 0, retryAfterMs: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/youtube/search?q=test");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns empty tracks when query param is missing", async () => {
    const req = new NextRequest("http://localhost/api/youtube/search");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracks).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("returns 400 for query longer than 120 characters", async () => {
    const longQuery = "a".repeat(121);
    const req = new NextRequest(`http://localhost/api/youtube/search?q=${longQuery}`);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns search results from YouTube API", async () => {
    const videoIds = ["dQw4w9WgXcQ", "aBcDeFgHiJk"];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => makeSearchResponse(videoIds),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => makeDetailsResponse(videoIds),
        }),
    );

    const req = new NextRequest("http://localhost/api/youtube/search?q=never+gonna");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracks).toHaveLength(2);
    expect(body.tracks[0].sourceType).toBe("youtube");
    expect(body.tracks[0].youtubeVideoId).toBe("dQw4w9WgXcQ");
    expect(body.tracks[0].duration).toBe(210); // PT3M30S = 210s
  });

  it("returns 502 when YouTube search API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
      }),
    );

    const req = new NextRequest("http://localhost/api/youtube/search?q=test");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("UPSTREAM_ERROR");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000, retryAfterMs: 30_000 });
    const req = new NextRequest("http://localhost/api/youtube/search?q=test");
    const res = await GET(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("returns 500 when YOUTUBE_API_KEY is not set", async () => {
    const original = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    try {
      const req = new NextRequest("http://localhost/api/youtube/search?q=test");
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe("CONFIG_ERROR");
    } finally {
      process.env.YOUTUBE_API_KEY = original;
    }
  });

  it("returns empty tracks when YouTube returns no video items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], nextPageToken: undefined }),
      }),
    );

    const req = new NextRequest("http://localhost/api/youtube/search?q=obscure+search");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracks).toEqual([]);
    expect(body.hasMore).toBe(false);
  });
});
