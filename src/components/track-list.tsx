"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Track } from "@/lib/catalog";
import { formatDuration } from "@/lib/format";
import { fetchPlaylists, type PlaylistSummary } from "@/lib/playlist";
import { usePlayerStore } from "@/store/player-store";

type ApiPayload = {
  message?: string;
  playlists?: PlaylistSummary[];
  playlist?: PlaylistSummary;
  tracks?: Track[];
  nextPageToken?: string | null;
  hasMore?: boolean;
};

async function createPlaylist(name: string, cover?: string) {
  const response = await fetch("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cover }),
  });

  const payload = await readApiPayload(response);

  if (!response.ok || !payload.playlist) {
    throw new Error(payload.message || "Failed to create playlist");
  }

  return payload.playlist;
}

async function saveTrackToPlaylist(playlistId: string, track: Track) {
  const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track }),
  });

  const payload = await readApiPayload(response);
  if (!response.ok) {
    throw new Error(payload.message || "Failed to save track");
  }
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as ApiPayload;
  }

  const rawText = await response.text();
  return {
    message: rawText || `Request failed with status ${response.status}`,
  };
}

export function TrackList({ tracks }: { tracks: Track[] }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const storePlayTrack = usePlayerStore((state) => state.playTrack);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setTracks = usePlayerStore((state) => state.setTracks);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNextPageToken, setSearchNextPageToken] = useState<string | null>(null);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistCover, setNewPlaylistCover] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);

  const { data: playlists = [] } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });

  useEffect(() => {
    if (!selectedPlaylistId && playlists[0]?.id) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [playlists, selectedPlaylistId]);

  useEffect(() => {
    const onFocusSearch = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined;
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (detail) {
        setQuery(detail);
        setDebouncedQuery(detail);
      }
      searchInputRef.current?.focus();
    };

    window.addEventListener("focus-search", onFocusSearch);
    return () => window.removeEventListener("focus-search", onFocusSearch);
  }, []);

  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const q = searchParams.get("q");
      if (q) {
        setQuery(q);
        setDebouncedQuery(q);
      }
      searchInputRef.current?.focus();
    }
  }, [searchParams]);

  const createPlaylistMutation = useMutation({
    mutationFn: ({ name, cover }: { name: string; cover?: string }) => createPlaylist(name, cover),
    onSuccess: (playlist) => {
      setNewPlaylistName("");
      setNewPlaylistCover("");
      setSelectedPlaylistId(playlist.id);
      setSaveError(null);
      setSaveMessage(`Playlist "${playlist.name}" created.`);
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (error) => {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : "Failed to create playlist.");
    },
  });

  const playTrack = (track: Track, queue: Track[]) => {
    storePlayTrack(track, queue);
  };

  const onSearch = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError(null);
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      });
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(payload.message || "Failed to search YouTube.");
      }

      setActiveSearchTerm(trimmed);
      setResults(payload.tracks ?? []);
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (error) {
      setResults([]);
      setSearchError(error instanceof Error ? error.message : "Failed to search YouTube.");
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadMoreSearchResults = useCallback(async () => {
    if (!searchNextPageToken || !hasMoreSearchResults || isLoadingMoreSearch || isSearching) {
      return;
    }

    if (!activeSearchTerm) {
      return;
    }

    setIsLoadingMoreSearch(true);

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(activeSearchTerm)}&pageToken=${encodeURIComponent(searchNextPageToken)}`,
        { cache: "no-store" },
      );
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(payload.message || "Failed to load more tracks.");
      }

      setResults((prev) => {
        const merged = [...prev, ...(payload.tracks ?? [])];
        const unique = new Map<string, Track>();
        for (const track of merged) {
          unique.set(track.id, track);
        }
        return [...unique.values()];
      });
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Failed to load more tracks.");
    } finally {
      setIsLoadingMoreSearch(false);
    }
  }, [activeSearchTerm, hasMoreSearchResults, isLoadingMoreSearch, isSearching, searchNextPageToken]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    void onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  useEffect(() => {
    const sentinel = searchSentinelRef.current;
    if (!sentinel || !results.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreSearchResults();
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreSearchResults, results.length]);

  const onCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) {
      setSaveMessage(null);
      setSaveError("Playlist name cannot be empty.");
      return;
    }
    createPlaylistMutation.mutate({ name, cover: newPlaylistCover.trim() || undefined });
  };

  const onSaveTrack = async (track: Track) => {
    if (!selectedPlaylistId) {
      setSaveMessage(null);
      setSaveError("Please select a playlist before saving a track.");
      return;
    }

    setSavingTrackId(track.id);
    setSaveMessage(null);
    setSaveError(null);

    try {
      await saveTrackToPlaylist(selectedPlaylistId, track);
      const playlistName = playlists.find((item) => item.id === selectedPlaylistId)?.name || "playlist";
      setSaveMessage(`"${track.title}" saved to ${playlistName}.`);
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save track.");
    } finally {
      setSavingTrackId(null);
    }
  };

  const renderRow = (track: Track, queue: Track[], accent: "default" | "youtube") => {
    const active = currentTrack?.id === track.id;

    return (
      <div
        className={`grid w-full grid-cols-[2.2fr_1.2fr_0.7fr_auto] items-center gap-2 px-4 py-3 transition ${
          accent === "youtube" ? "hover:bg-cyan-500/10" : "hover:bg-white/10"
        } ${active ? (accent === "youtube" ? "bg-cyan-500/10" : "bg-white/10") : ""}`}
        key={track.id}
      >
        <button className="min-w-0 text-left" onClick={() => playTrack(track, queue)} type="button">
          <div className="flex items-center gap-3">
            <Image
              alt={track.title}
              className="h-10 w-10 shrink-0 rounded-md object-cover"
              src={track.cover}
             
              width={40}
              height={40}
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{track.title}</p>
              <p className="truncate text-sm text-white/65">{track.artist}</p>
            </div>
          </div>
        </button>

        <p className="truncate text-sm text-white/65">{track.album}</p>
        <p className="text-right text-sm text-white/65">{formatDuration(track.duration)}</p>

        <Button
          className="h-8 px-3"
          disabled={!selectedPlaylistId || savingTrackId === track.id}
          onClick={() => void onSaveTrack(track)}
          type="button"
          variant="ghost"
        >
          {savingTrackId === track.id ? "Saving..." : "Save"}
        </Button>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3" ref={rootRef}>
      <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_1fr_auto]">
        <select
          className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
          onChange={(event) => setSelectedPlaylistId(event.target.value)}
          value={selectedPlaylistId}
        >
          <option className="text-black" value="">
            Select playlist...
          </option>
          {playlists.map((playlist) => (
            <option className="text-black" key={playlist.id} value={playlist.id}>
              {playlist.name} ({playlist.trackCount})
            </option>
          ))}
        </select>

        <Input
          onChange={(event) => setNewPlaylistName(event.target.value)}
          placeholder="Create a new playlist..."
          value={newPlaylistName}
        />
        <Input
          onChange={(event) => setNewPlaylistCover(event.target.value)}
          placeholder="Cover URL playlist (optional)"
          value={newPlaylistCover}
        />

        <Button
          disabled={createPlaylistMutation.isPending}
          onClick={onCreatePlaylist}
          type="button"
          variant="ghost"
        >
          {createPlaylistMutation.isPending ? "Creating..." : "Create Playlist"}
        </Button>
      </div>

      {saveMessage ? <p className="mb-3 text-sm text-lime-300">{saveMessage}</p> : null}
      {saveError ? <p className="mb-3 text-sm text-red-300">{saveError}</p> : null}

      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void onSearch(query);
        }}
      >
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search music from YouTube..."
          ref={searchInputRef}
          value={query}
        />
        <Button disabled={isSearching} type="submit">
          <Search className="mr-2 h-4 w-4" />
          {isSearching ? "Searching..." : "Search"}
        </Button>
      </form>
      {searchError ? <p className="mb-3 text-sm text-red-300">{searchError}</p> : null}

      <div className="grid grid-cols-[2.2fr_1.2fr_0.7fr_auto] border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/45">
        <span>Title</span>
        <span>Album</span>
        <span className="text-right">Time</span>
        <span className="text-right">Action</span>
      </div>

      {tracks.map((track) => renderRow(track, tracks, "default"))}

      {results.length ? (
        <>
          <div className="mt-6 grid grid-cols-[2.2fr_1.2fr_0.7fr_auto] border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-cyan-200/70">
            <span>YouTube Result</span>
            <span>Source</span>
            <span className="text-right">Time</span>
            <span className="text-right">Action</span>
          </div>
          {results.map((track) => renderRow(track, results, "youtube"))}
          <div ref={searchSentinelRef} />
          {isLoadingMoreSearch ? (
            <p className="px-4 py-2 text-xs text-white/65">Loading more results...</p>
          ) : null}
          {!hasMoreSearchResults ? <p className="px-4 py-2 text-xs text-white/45">No more results.</p> : null}
        </>
      ) : null}
    </div>
  );
}
