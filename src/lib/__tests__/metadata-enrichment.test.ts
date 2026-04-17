import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enrichTrackMetadata } from "@/lib/metadata-enrichment";

const ORIGINAL_DISCOGS = process.env.DISCOGS_TOKEN;

type FetchResponse = {
  url: string;
  status?: number;
  body: unknown;
};

function mockFetch(responses: FetchResponse[]) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as URL | { url: string }).toString();
    const match = responses.find((r) => url.includes(r.url));
    if (!match) {
      return new Response(JSON.stringify({}), { status: 404 });
    }
    return new Response(JSON.stringify(match.body), {
      status: match.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  delete process.env.DISCOGS_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_DISCOGS === undefined) delete process.env.DISCOGS_TOKEN;
  else process.env.DISCOGS_TOKEN = ORIGINAL_DISCOGS;
});

describe("enrichTrackMetadata", () => {
  it("extracts year, country and musicbrainzId from a high-score MB recording", async () => {
    mockFetch([
      {
        url: "musicbrainz.org",
        body: {
          recordings: [
            {
              id: "mb-recording-id-1234",
              score: 95,
              "first-release-date": "2018-03-14",
              releases: [{ country: "JP" }],
              "artist-credit": [{ artist: { country: "JP" } }],
            },
          ],
        },
      },
    ]);

    const result = await enrichTrackMetadata("Lemon", "Kenshi Yonezu");
    expect(result.year).toBe(2018);
    expect(result.country).toBe("JP");
    expect(result.musicbrainzId).toBe("mb-recording-id-1234");
    expect(result.sources).toContain("musicbrainz");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("falls back to Discogs year/country when MusicBrainz misses them", async () => {
    process.env.DISCOGS_TOKEN = "token-xyz";
    mockFetch([
      {
        url: "musicbrainz.org",
        body: {
          recordings: [{ id: "mb-id", score: 90 }],
        },
      },
      {
        url: "api.discogs.com",
        body: {
          results: [
            {
              year: 2005,
              country: "Japan",
              genre: ["Electronic"],
              style: ["J-Pop"],
            },
          ],
        },
      },
    ]);

    const result = await enrichTrackMetadata("Song", "Artist");
    expect(result.year).toBe(2005);
    expect(result.country).toBe("Japan");
    expect(result.genre).toBe("J-Pop"); // prefers style over genre
    expect(result.sources).toEqual(["musicbrainz", "discogs"]);
    expect(result.confidence).toBe(0.9);
  });

  it("ignores MB results below the score threshold", async () => {
    mockFetch([
      {
        url: "musicbrainz.org",
        body: {
          recordings: [{ id: "mb-low", score: 40, "first-release-date": "1999" }],
        },
      },
    ]);

    const result = await enrichTrackMetadata("Obscure", "Unknown");
    expect(result.musicbrainzId).toBeNull();
    expect(result.year).toBeNull();
    expect(result.sources).toHaveLength(0);
  });

  it("skips Discogs entirely when no token is configured", async () => {
    const fetchMock = mockFetch([
      {
        url: "musicbrainz.org",
        body: { recordings: [{ id: "mb", score: 95 }] },
      },
    ]);

    const result = await enrichTrackMetadata("Song", "Artist");
    expect(result.sources).toEqual(["musicbrainz"]);
    const discogsCalled = fetchMock.mock.calls.some(([url]) =>
      String(url).includes("discogs"),
    );
    expect(discogsCalled).toBe(false);
  });

  it("returns a safe empty result when both sources fail", async () => {
    mockFetch([
      { url: "musicbrainz.org", status: 503, body: {} },
      { url: "api.discogs.com", status: 500, body: {} },
    ]);

    const result = await enrichTrackMetadata("Song", "Artist");
    expect(result.year).toBeNull();
    expect(result.country).toBeNull();
    expect(result.genre).toBeNull();
    expect(result.musicbrainzId).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
