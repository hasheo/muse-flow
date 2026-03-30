import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import YTMusic from "ytmusic-api";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import type { Track } from "@/lib/catalog";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  pageToken: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

type YouTubeSearchItem = {
  id: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

type YouTubeVideoItem = {
  id?: string;
  contentDetails?: {
    duration?: string;
  };
};

function parseIsoDuration(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * Strip common YouTube video title noise to extract the actual song name.
 * e.g. "Shining Your Song (Official Music Video)" → "Shining Your Song"
 */
function cleanSongTitle(raw: string): string {
  return (
    raw
      // Remove bracketed/parenthesized suffixes: (Official Video), [MV], (Lyrics), etc.
      .replace(/[\(\[【](?:official\s*(?:music\s*)?(?:video|mv|audio|lyric(?:s)?\s*(?:video)?)|music\s*video|lyric(?:s)?\s*(?:video)?|mv|m\/v|full\s*ver(?:sion)?\.?|short\s*ver(?:sion)?\.?|audio|hd|hq|4k|remaster(?:ed)?|live|pv|animated?\s*(?:mv|video)?|visualizer|clip\s*officiel|video\s*oficial|歌ってみた|踊ってみた)[\)\]】]/gi,
        "",
      )
      // Remove unbracketed trailing tags after the title
      .replace(/\s+(?:official\s*(?:music\s*)?(?:video|mv|audio)|music\s*video|lyric(?:s)?\s*video|mv|m\/v)\s*$/gi, "")
      // Remove "feat./ft." features from title (keep artist clean)
      .replace(/\s*(?:feat\.?|ft\.?)\s+.+$/i, "")
      .trim()
      // Clean up leftover punctuation from removed brackets
      .replace(/\s*[-–—]\s*$/, "")
      .trim()
  );
}

// ── YouTube Music (unofficial) search via ytmusic-api ──

let ytmusicInstance: YTMusic | null = null;

async function getYTMusic(): Promise<YTMusic> {
  if (!ytmusicInstance) {
    ytmusicInstance = new YTMusic();
    await ytmusicInstance.initialize();
  }
  return ytmusicInstance;
}

async function searchWithYTMusic(query: string): Promise<Track[]> {
  const ytmusic = await getYTMusic();
  const songs = await ytmusic.searchSongs(query);

  return songs.slice(0, 20).flatMap((song) => {
    if (!song.videoId) return [];

    const thumbnail =
      song.thumbnails.find((t) => t.width >= 300) ??
      song.thumbnails[song.thumbnails.length - 1];

    return [
      {
        id: `yt-${song.videoId}`,
        sourceType: "youtube" as const,
        youtubeVideoId: song.videoId,
        title: song.name,
        artist: song.artist.name,
        album: song.album?.name ?? "",
        cover: thumbnail?.url ?? "",
        duration: song.duration ?? 0,
      },
    ];
  });
}

// ── YouTube Data API (official) search – used as fallback / pagination ──

async function searchWithYouTubeAPI(
  query: string,
  apiKey: string,
  pageToken?: string,
): Promise<{ tracks: Track[]; nextPageToken: string | null; hasMore: boolean }> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", "10");
  searchUrl.searchParams.set("q", query);
  if (pageToken) {
    searchUrl.searchParams.set("pageToken", pageToken);
  }
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl, { cache: "no-store" });
  if (!searchResponse.ok) {
    throw new UpstreamError(`YouTube search failed with status ${searchResponse.status}`);
  }

  const searchData = (await searchResponse.json()) as {
    items?: YouTubeSearchItem[];
    nextPageToken?: string;
  };
  const items = searchData.items ?? [];
  const videoIds = items
    .map((item) => item.id.videoId)
    .filter((value): value is string => Boolean(value));

  if (!videoIds.length) {
    return {
      tracks: [],
      nextPageToken: searchData.nextPageToken ?? null,
      hasMore: Boolean(searchData.nextPageToken),
    };
  }

  const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videoUrl.searchParams.set("part", "contentDetails");
  videoUrl.searchParams.set("id", videoIds.join(","));
  videoUrl.searchParams.set("key", apiKey);

  const detailsResponse = await fetch(videoUrl, { cache: "no-store" });
  if (!detailsResponse.ok) {
    throw new Error(`YouTube video details failed with status ${detailsResponse.status}`);
  }

  const detailsData = (await detailsResponse.json()) as { items?: YouTubeVideoItem[] };
  const durationMap = new Map<string, number>();

  for (const item of detailsData.items ?? []) {
    if (!item.id) continue;
    durationMap.set(item.id, parseIsoDuration(item.contentDetails?.duration));
  }

  const tracks: Track[] = items.flatMap((item) => {
    const videoId = item.id.videoId;
    if (!videoId) return [];

    const rawTitle = item.snippet?.title?.trim() || "Untitled";
    const rawChannel = item.snippet?.channelTitle?.trim() || "Unknown";
    const channel = rawChannel.replace(/\s*-\s*Topic$/, "");
    const cover =
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      "";

    const separatorMatch = rawTitle.match(/^(.+?)\s*[-–—]\s+(.+)$/);
    let title: string;
    let artist: string;
    let album: string;

    if (separatorMatch) {
      artist = cleanSongTitle(separatorMatch[1].trim());
      title = cleanSongTitle(separatorMatch[2].trim());
      album = channel;
    } else {
      title = cleanSongTitle(rawTitle);
      artist = channel;
      album = "";
    }

    return [
      {
        id: `yt-${videoId}`,
        sourceType: "youtube" as const,
        youtubeVideoId: videoId,
        title,
        artist,
        album,
        cover,
        duration: durationMap.get(videoId) ?? 0,
      },
    ];
  });

  return {
    tracks,
    nextPageToken: searchData.nextPageToken ?? null,
    hasMore: Boolean(searchData.nextPageToken),
  };
}

// ── Route handler ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) {
      return NextResponse.json({ tracks: [], nextPageToken: null, hasMore: false });
    }

    const parsedQuery = searchQuerySchema.safeParse({
      q: query,
      pageToken: request.nextUrl.searchParams.get("pageToken")?.trim() || undefined,
    });

    if (!parsedQuery.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters.",
        details: zodErrorDetails(parsedQuery.error),
      });
    }

    const clientIp = getClientIp(request.headers);
    const rateLimit = await checkRateLimit(`youtube-search:${session.user.id}:${clientIp}`, {
      windowMs: 60_000,
      maxRequests: 50,
    });

    if (!rateLimit.allowed) {
      return apiError({
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
        details: { retryAfterMs: rateLimit.retryAfterMs },
        headers: {
          "Retry-After": Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
        },
      });
    }

    const pageToken = parsedQuery.data.pageToken;

    // For initial search (no pageToken), try YouTube Music API first for clean metadata.
    // Fall back to YouTube Data API for pagination or if YTMusic fails.
    if (!pageToken) {
      try {
        const tracks = await searchWithYTMusic(query);
        if (tracks.length > 0) {
          return NextResponse.json({
            tracks,
            nextPageToken: null,
            hasMore: false,
          });
        }
      } catch {
        // YTMusic failed — fall through to YouTube Data API
      }
    }

    // Fallback: YouTube Data API (also handles pagination)
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return apiError({
        status: 500,
        code: "CONFIG_ERROR",
        message: "Missing YOUTUBE_API_KEY in environment variables.",
      });
    }

    const result = await searchWithYouTubeAPI(query, apiKey, pageToken);

    return NextResponse.json({
      tracks: result.tracks,
      nextPageToken: result.nextPageToken,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof UpstreamError) {
      return apiError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "The upstream search service returned an error.",
        details: error instanceof Error ? { reason: error.message } : undefined,
      });
    }
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process YouTube search request",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
