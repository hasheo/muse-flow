/**
 * Track metadata enrichment.
 *
 * Queries MusicBrainz (primary) and Discogs (secondary, optional) to auto-fill
 * year / country / genre when an admin adds a catalog track. Calls are made
 * server-side only so we don't leak the Discogs token and so MusicBrainz sees
 * a consistent User-Agent (MB requires one and rate-limits 1 req/sec).
 *
 * The result is advisory — the admin reviews it in the UI before saving. We
 * never block adding a track on enrichment success.
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "MuseFlow/1.0 ( https://github.com/hasheo/muse-flow )";
const MB_MIN_SCORE = 70;

export type EnrichmentSource = "musicbrainz" | "discogs";

export type EnrichmentResult = {
  year: number | null;
  country: string | null;
  genre: string | null;
  musicbrainzId: string | null;
  confidence: number;
  sources: EnrichmentSource[];
};

type MusicBrainzRecording = {
  id: string;
  score?: number;
  "first-release-date"?: string;
  releases?: Array<{
    country?: string;
    "release-group"?: { "primary-type"?: string };
  }>;
  "artist-credit"?: Array<{
    artist?: { country?: string };
  }>;
};

type DiscogsSearchResult = {
  year?: string | number;
  country?: string;
  genre?: string[];
  style?: string[];
};

function yearFromDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  return year;
}

function pickFirst<T>(values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

async function fetchMusicBrainz(
  title: string,
  artist: string,
): Promise<{ result: MusicBrainzRecording | null; ok: boolean }> {
  const query = `recording:"${title.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
  const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1&inc=releases+artist-credits`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { result: null, ok: false };

    const payload = (await response.json()) as { recordings?: MusicBrainzRecording[] };
    const best = payload.recordings?.[0] ?? null;
    if (!best || (best.score ?? 0) < MB_MIN_SCORE) {
      return { result: null, ok: true };
    }
    return { result: best, ok: true };
  } catch {
    return { result: null, ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscogs(
  title: string,
  artist: string,
): Promise<{ result: DiscogsSearchResult | null; ok: boolean }> {
  // Read live from process.env rather than the validated env snapshot so
  // admins can rotate the token without a server restart, and so unit tests
  // can toggle it per-case. The env validator declares this optional with no
  // shape constraints, so there's nothing to lose by skipping the cache.
  const token = process.env.DISCOGS_TOKEN?.trim();
  if (!token) return { result: null, ok: false };

  const params = new URLSearchParams({
    q: `${artist} ${title}`,
    type: "release",
    per_page: "1",
    token,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${DISCOGS_BASE}/database/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { result: null, ok: false };

    const payload = (await response.json()) as { results?: DiscogsSearchResult[] };
    return { result: payload.results?.[0] ?? null, ok: true };
  } catch {
    return { result: null, ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function enrichTrackMetadata(
  title: string,
  artist: string,
): Promise<EnrichmentResult> {
  const [mb, dg] = await Promise.all([
    fetchMusicBrainz(title, artist),
    fetchDiscogs(title, artist),
  ]);

  const sources: EnrichmentSource[] = [];
  if (mb.result) sources.push("musicbrainz");
  if (dg.result) sources.push("discogs");

  const mbYear = yearFromDate(mb.result?.["first-release-date"]);
  const dgYear = (() => {
    const raw = dg.result?.year;
    if (!raw) return null;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num) || num < 1900 || num > 2100) return null;
    return num;
  })();

  const mbCountry = pickFirst([
    mb.result?.releases?.[0]?.country,
    mb.result?.["artist-credit"]?.[0]?.artist?.country,
  ]);
  const dgCountry = dg.result?.country ?? null;

  // Discogs "style" is more specific than "genre" (e.g. "J-Pop" vs "Pop"), so
  // prefer it when present.
  const dgGenre = pickFirst([dg.result?.style?.[0], dg.result?.genre?.[0]]);

  const confidence = (() => {
    if (mb.result && dg.result) return 0.9;
    if (mb.result) return 0.7;
    if (dg.result) return 0.55;
    return 0;
  })();

  return {
    year: pickFirst([mbYear, dgYear]),
    country: pickFirst([mbCountry, dgCountry]),
    genre: dgGenre,
    musicbrainzId: mb.result?.id ?? null,
    confidence,
    sources,
  };
}
