export const DEFAULT_PLAYLIST_COVER =
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=80";

export type PlaylistSummary = {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
};

export async function fetchPlaylists<T extends PlaylistSummary = PlaylistSummary>(): Promise<T[]> {
  const response = await fetch("/api/playlists", { cache: "no-store" });
  const payload = (await response.json()) as { playlists?: T[]; message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Failed to fetch playlists");
  }

  return payload.playlists ?? [];
}
