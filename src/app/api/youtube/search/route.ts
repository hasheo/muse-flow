import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return apiError({
        status: 500,
        code: "CONFIG_ERROR",
        message: "Missing YOUTUBE_API_KEY in environment variables.",
      });
    }

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
      return apiError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "Failed to search YouTube.",
        details: { provider: "youtube", endpoint: "search", status: searchResponse.status },
      });
    }

    const searchData = (await searchResponse.json()) as {
      items?: YouTubeSearchItem[];
      nextPageToken?: string;
    };
    const items = searchData.items ?? [];
    const videoIds = items.map((item) => item.id.videoId).filter((value): value is string => Boolean(value));

    if (!videoIds.length) {
      return NextResponse.json({
        tracks: [],
        nextPageToken: searchData.nextPageToken ?? null,
        hasMore: Boolean(searchData.nextPageToken),
      });
    }

    const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videoUrl.searchParams.set("part", "contentDetails");
    videoUrl.searchParams.set("id", videoIds.join(","));
    videoUrl.searchParams.set("key", apiKey);

    const detailsResponse = await fetch(videoUrl, { cache: "no-store" });
    if (!detailsResponse.ok) {
      return apiError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "Failed to fetch video details.",
        details: { provider: "youtube", endpoint: "videos", status: detailsResponse.status },
      });
    }

    const detailsData = (await detailsResponse.json()) as { items?: YouTubeVideoItem[] };
    const durationMap = new Map<string, number>();

    for (const item of detailsData.items ?? []) {
      if (!item.id) {
        continue;
      }
      durationMap.set(item.id, parseIsoDuration(item.contentDetails?.duration));
    }

    const tracks: Track[] = items.flatMap((item) => {
      const videoId = item.id.videoId;
      if (!videoId) {
        return [];
      }

      const title = item.snippet?.title?.trim() || "Untitled";
      const artist = item.snippet?.channelTitle?.trim() || "YouTube";
      const cover =
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "";

      return [
        {
          id: `yt-${videoId}`,
          sourceType: "youtube",
          youtubeVideoId: videoId,
          title,
          artist,
          album: "YouTube Music",
          cover,
          duration: durationMap.get(videoId) ?? 0,
        },
      ];
    });

    const nextPageToken = searchData.nextPageToken ?? null;

    return NextResponse.json({
      tracks,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process YouTube search request",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
