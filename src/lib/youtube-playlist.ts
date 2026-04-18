import YTMusic from "ytmusic-api";

/**
 * Fetching YouTube Music playlists for the admin catalog importer.
 *
 * `ytmusic-api` is already initialized lazily in the search route; we keep a
 * separate module-local instance here so import can run without touching that
 * one. Initialization is memoized — first call costs a few hundred ms, rest
 * are free.
 */

let ytmusicInstance: YTMusic | null = null;

async function getYTMusic(): Promise<YTMusic> {
  if (!ytmusicInstance) {
    ytmusicInstance = new YTMusic();
    await ytmusicInstance.initialize();
  }
  return ytmusicInstance;
}

export type PlaylistVideo = {
  youtubeVideoId: string;
  title: string;
  artist: string;
  duration: number;
  cover: string;
};

/**
 * Extract the YouTube playlist ID from a URL, or return a cleaned raw ID.
 *
 * Accepts:
 *   https://music.youtube.com/playlist?list=PLxxx
 *   https://www.youtube.com/playlist?list=PLxxx&si=...
 *   https://youtube.com/watch?v=VVV&list=PLxxx
 *   PLxxx (raw id)
 *
 * Returns null if nothing that looks like a valid list id can be found.
 */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/[?&]list=([^&#]+)/);
  const candidate = urlMatch ? urlMatch[1] : trimmed;

  // YouTube playlist IDs are alphanumeric + dash/underscore, typically 13-50
  // chars. Reject anything with whitespace or obvious URL fragments left over.
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(candidate)) return null;
  return candidate;
}

export async function fetchPlaylistTracks(playlistId: string): Promise<PlaylistVideo[]> {
  const ytmusic = await getYTMusic();
  const videos = await ytmusic.getPlaylistVideos(playlistId);

  return videos.flatMap((video) => {
    if (!video.videoId) return [];

    const thumbnail =
      video.thumbnails.find((t) => t.width >= 300) ??
      video.thumbnails[video.thumbnails.length - 1];

    return [
      {
        youtubeVideoId: video.videoId,
        title: video.name,
        artist: video.artist.name,
        duration: video.duration ?? 0,
        cover: thumbnail?.url ?? "",
      },
    ];
  });
}
