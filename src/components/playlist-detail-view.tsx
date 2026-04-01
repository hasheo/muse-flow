"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Music,
  Pause,
  Pencil,
  Play,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { ManageCollaboratorsDialog } from "@/components/manage-collaborators-dialog";
import { ManageTracksDialog } from "@/components/manage-tracks-dialog";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_PLAYLIST_COVER } from "@/lib/playlist";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player-store";

type TrackWithAttribution = Track & {
  addedBy?: { id: string; name: string | null; image: string | null } | null;
};

type PlaylistDetail = {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
  role?: "owner" | "collaborator" | "viewer";
};

type PlaylistDetailResponse = {
  playlist?: PlaylistDetail;
  tracks?: TrackWithAttribution[];
  message?: string;
};

async function fetchPlaylistTracks(playlistId: string) {
  const response = await fetch(`/api/playlists/${playlistId}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as PlaylistDetailResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Failed to fetch playlist tracks");
  }

  return payload;
}

function formatTotalDuration(tracks: Track[]) {
  const totalSeconds = tracks.reduce(
    (sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0),
    0,
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function PlaylistDetailView({ playlistId }: { playlistId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { toast } = useToast();

  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false);
  const [isManageTracksOpen, setIsManageTracksOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [searchNextPageToken, setSearchNextPageToken] = useState<string | null>(
    null,
  );
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const [removingTrackId, setRemovingTrackId] = useState<string | null>(null);
  const { data: session } = useSession();

  const searchResultsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const storePlayTrack = usePlayerStore((state) => state.playTrack);
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const {
    data: playlistDetail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["playlist-tracks", playlistId],
    queryFn: () => fetchPlaylistTracks(playlistId),
  });

  const tracks = useMemo(() => playlistDetail?.tracks ?? [], [playlistDetail]);

  const deleteTrackMutation = useMutation({
    mutationFn: async ({ trackId }: { trackId: string }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to delete track");
      }
    },
    onSuccess: async () => {
      toast({ message: "Track removed from playlist.", variant: "success" });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["playlist-tracks", playlistId],
        }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      toast({
        message: e instanceof Error ? e.message : "Failed to delete track",
        variant: "error",
      });
    },
    onSettled: () => {
      setDeletingTrackId(null);
    },
  });

  const reorderTracksMutation = useMutation({
    mutationFn: async ({ trackIds }: { trackIds: string[] }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to reorder playlist");
      }
    },
    onSuccess: async () => {
      toast({ message: "Track order updated.", variant: "success" });
      await queryClient.invalidateQueries({
        queryKey: ["playlist-tracks", playlistId],
      });
    },
    onError: (e) => {
      toast({
        message: e instanceof Error ? e.message : "Failed to reorder playlist",
        variant: "error",
      });
      void queryClient.invalidateQueries({
        queryKey: ["playlist-tracks", playlistId],
      });
    },
  });

  const updatePlaylistMutation = useMutation({
    mutationFn: async ({ name, cover }: { name?: string; cover?: string }) => {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cover }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to update playlist");
      }
    },
    onSuccess: async () => {
      toast({ message: "Playlist updated.", variant: "success" });
      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["playlist-tracks", playlistId],
        }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      toast({
        message: e instanceof Error ? e.message : "Failed to update playlist",
        variant: "error",
      });
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to delete playlist");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      router.push("/library");
    },
    onError: (e) => {
      toast({
        message: e instanceof Error ? e.message : "Failed to delete playlist",
        variant: "error",
      });
    },
  });

  const saveTrackMutation = useMutation({
    mutationFn: async ({ track }: { track: Track }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to add track");
      }
    },
    onSuccess: async (_data, { track }) => {
      setSavingTrackId(null);
      toast({
        message: `Added "${track.title}" to playlist`,
        variant: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["playlist-tracks", playlistId],
        }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      setSavingTrackId(null);
      toast({
        message: e instanceof Error ? e.message : "Failed to add track",
        variant: "error",
      });
    },
  });

  const removeTrackFromDialogMutation = useMutation({
    mutationFn: async ({ trackId }: { trackId: string }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to remove track");
      }
    },
    onSuccess: async () => {
      setRemovingTrackId(null);
      toast({ message: "Track removed from playlist", variant: "success" });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["playlist-tracks", playlistId],
        }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      setRemovingTrackId(null);
      toast({
        message: e instanceof Error ? e.message : "Failed to remove track",
        variant: "error",
      });
    },
  });

  const existingTrackIds = useMemo(
    () => new Set(tracks.map((t) => t.id)),
    [tracks],
  );

  const onSearchTracks = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        tracks?: Track[];
        nextPageToken?: string;
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok) throw new Error(payload.message || "Search failed");
      setActiveSearchTerm(trimmed);
      setSearchResults(payload.tracks ?? []);
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (err) {
      setSearchResults([]);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadMoreSearchResults = useCallback(async () => {
    if (
      !searchNextPageToken ||
      !hasMoreSearchResults ||
      isLoadingMoreSearch ||
      isSearching ||
      !activeSearchTerm
    )
      return;
    setIsLoadingMoreSearch(true);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(activeSearchTerm)}&pageToken=${encodeURIComponent(searchNextPageToken)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        tracks?: Track[];
        nextPageToken?: string;
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "Failed to load more");
      setSearchResults((prev) => {
        const merged = [...prev, ...(payload.tracks ?? [])];
        const unique = new Map<string, Track>();
        for (const t of merged) unique.set(t.id, t);
        return [...unique.values()];
      });
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to load more",
      );
    } finally {
      setIsLoadingMoreSearch(false);
    }
  }, [
    activeSearchTerm,
    hasMoreSearchResults,
    isLoadingMoreSearch,
    isSearching,
    searchNextPageToken,
  ]);

  useEffect(() => {
    const sentinel = searchSentinelRef.current;
    if (!sentinel || !searchResults.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreSearchResults();
      },
      { root: null, rootMargin: "120px", threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreSearchResults, searchResults.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex shrink-0 flex-col items-center lg:w-72 lg:items-start">
          <Skeleton className="aspect-square w-56 rounded-2xl lg:w-full" />
          <SkeletonText className="mt-5 w-full" lines={2} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Failed to load playlist"
        }
        onRetry={() =>
          void queryClient.invalidateQueries({
            queryKey: ["playlist-tracks", playlistId],
          })
        }
      />
    );
  }

  if (!playlistDetail?.playlist) {
    return (
      <EmptyState
        action={{ label: "Back to library", href: "/library" }}
        description="This playlist may have been deleted or you don't have access."
        icon={<Search />}
        title="Playlist not found"
      />
    );
  }

  const playlist = playlistDetail.playlist;
  const role = playlist.role || "owner";
  const isOwner = role === "owner";
  const isCollaborator = role === "collaborator";

  const isPlaylistPlaying =
    isPlaying &&
    currentTrack != null &&
    tracks.some((t) => t.id === currentTrack.id);

  const togglePlayAll = () => {
    if (tracks.length === 0) return;
    if (isPlaylistPlaying) {
      setPlaying(false);
    } else if (currentTrack && tracks.some((t) => t.id === currentTrack.id)) {
      setPlaying(true);
    } else {
      storePlayTrack(tracks[0], tracks);
    }
  };

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
        href="/library"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left: Playlist info */}
        <div className="flex shrink-0 flex-col items-center lg:sticky lg:top-0 lg:w-72 lg:self-start lg:items-start">
          <Image
            alt={playlist.name}
            className="aspect-square w-56 rounded-2xl object-cover lg:w-full"
            height={288}
            src={playlist.cover}
            unoptimized
            width={288}
          />

          {isEditing ? (
            <form
              className="mt-5 w-full space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const name = String(formData.get("playlistName") ?? "").trim();
                const cover = String(
                  formData.get("playlistCover") ?? "",
                ).trim();
                if (!name) {
                  toast({
                    message: "Playlist name cannot be empty.",
                    variant: "error",
                  });
                  return;
                }
                updatePlaylistMutation.mutate({
                  name,
                  cover: cover || DEFAULT_PLAYLIST_COVER,
                });
              }}
            >
              <Input
                defaultValue={playlist.name}
                key={`${playlist.id}-name`}
                name="playlistName"
                placeholder="Playlist name"
              />
              <Input
                defaultValue={playlist.cover}
                key={`${playlist.id}-cover`}
                name="playlistCover"
                placeholder="Cover URL"
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={updatePlaylistMutation.isPending}
                  type="submit"
                >
                  {updatePlaylistMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => setIsEditing(false)}
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-5 w-full text-center lg:text-left">
              <h2 className="text-2xl font-bold tracking-tight">
                {playlist.name}
              </h2>
              <p className="mt-1 text-sm text-white/50">
                {tracks.length} {tracks.length === 1 ? "song" : "songs"}
                {tracks.length > 0
                  ? ` \u00B7 ${formatTotalDuration(tracks)}`
                  : ""}
              </p>
            </div>
          )}

          {!isEditing ? (
            <div className="mt-5 w-full space-y-4">
              <div className="flex items-center justify-center gap-3 lg:justify-start">
                <button
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-0 bg-white text-black transition hover:scale-105 hover:bg-white/90 disabled:opacity-50"
                  disabled={tracks.length === 0}
                  onClick={togglePlayAll}
                  type="button"
                >
                  {isPlaylistPlaying ? (
                    <Pause className="h-6 w-6" fill="currentColor" />
                  ) : (
                    <Play
                      className="h-6 w-6 translate-x-0.5"
                      fill="currentColor"
                    />
                  )}
                </button>
                {isOwner && (
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    onClick={() => setIsEditing(true)}
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {isOwner && (
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-red-400/60 hover:text-red-400"
                    disabled={deletePlaylistMutation.isPending}
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {isOwner && (
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-lime-300/40 hover:text-lime-300"
                    onClick={() => setIsCollabDialogOpen(true)}
                    type="button"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                )}
              </div>
              {(isOwner || isCollaborator) && (
                <Button
                  className="w-full"
                  onClick={() => setIsManageTracksOpen(true)}
                  type="button"
                >
                  Manage Tracks
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: Track list */}
        <div className="min-w-0 flex-1">
          {!tracks.length ? (
            <EmptyState
              className="py-10"
              description="Use Manage Tracks to search and add songs."
              icon={<Music />}
              title="No tracks yet"
            />
          ) : (
            <div className="max-h-[70vh] divide-y divide-white/5 overflow-y-auto pr-1">
              {tracks.map((track) => {
                const active = currentTrack?.id === track.id;

                return (
                  <div
                    className={`group flex cursor-pointer items-center gap-4 rounded-lg px-3 py-2.5 transition ${
                      active ? "bg-white/10" : "hover:bg-white/[0.06]"
                    }`}
                    draggable={isOwner}
                    key={`${playlistId}-${track.id}`}
                    onClick={() => {
                      storePlayTrack(track, tracks);
                    }}
                    onDragEnd={() => {
                      if (!isOwner) return;
                      setDraggingTrackId(null);
                    }}
                    onDragOver={(event) => {
                      if (!isOwner) return;
                      event.preventDefault();
                    }}
                    onDragStart={() => {
                      if (!isOwner) return;
                      setDraggingTrackId(track.id);
                    }}
                    onDrop={() => {
                      if (!isOwner) return;
                      if (!draggingTrackId || draggingTrackId === track.id)
                        return;

                      const sourceIndex = tracks.findIndex(
                        (item) => item.id === draggingTrackId,
                      );
                      const targetIndex = tracks.findIndex(
                        (item) => item.id === track.id,
                      );
                      if (sourceIndex < 0 || targetIndex < 0) return;

                      const nextTracks = [...tracks];
                      const [dragged] = nextTracks.splice(sourceIndex, 1);
                      nextTracks.splice(targetIndex, 0, dragged);

                      queryClient.setQueryData<PlaylistDetailResponse>(
                        ["playlist-tracks", playlistId],
                        (prev) => {
                          if (!prev) return prev;
                          return { ...prev, tracks: nextTracks };
                        },
                      );

                      setDraggingTrackId(null);
                      reorderTracksMutation.mutate({
                        trackIds: nextTracks.map((item) => item.id),
                      });
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="relative shrink-0 overflow-hidden rounded-md">
                      <Image
                        alt={track.title}
                        className="h-12 w-12 object-cover"
                        height={48}
                        src={track.cover}
                        unoptimized
                        width={48}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                        <Play
                          className="h-5 w-5 text-white"
                          fill="currentColor"
                        />
                      </div>
                    </div>

                    {/* Title & artist */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${active ? "text-lime-400" : "text-white"}`}
                      >
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {track.artist}
                        {track.album ? ` \u00B7 ${track.album}` : ""}
                      </p>
                    </div>

                    {/* Track attribution */}
                    {track.addedBy && (
                      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {track.addedBy.image ? (
                          <Image
                            alt={track.addedBy.name || ""}
                            className="h-5 w-5 rounded-full object-cover"
                            height={20}
                            src={track.addedBy.image}
                            unoptimized
                            width={20}
                          />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-white/50">
                            {(track.addedBy.name || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-white/30">
                          {track.addedBy.name || "Unknown"}
                        </span>
                      </div>
                    )}

                    {/* Delete button */}
                    {(isOwner ||
                      (isCollaborator &&
                        track.addedBy?.id === session?.user?.id)) && (
                      <button
                        className="shrink-0 text-white/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        disabled={deletingTrackId === track.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingTrackId(track.id);
                          deleteTrackMutation.mutate({ trackId: track.id });
                        }}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}

                    {/* Duration */}
                    <span className="shrink-0 text-sm text-white/50">
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete Playlist"
        description={`Playlist "${playlist.name}" and all its tracks will be permanently deleted.`}
        isConfirming={deletePlaylistMutation.isPending}
        onCancel={() => {
          if (deletePlaylistMutation.isPending) return;
          setIsDeleteConfirmOpen(false);
        }}
        onConfirm={() => {
          setIsDeleteConfirmOpen(false);
          deletePlaylistMutation.mutate();
        }}
        open={isDeleteConfirmOpen}
        title="Delete this playlist?"
      />

      <ManageCollaboratorsDialog
        onClose={() => setIsCollabDialogOpen(false)}
        open={isCollabDialogOpen}
        playlistId={playlistId}
        playlistName={playlist.name}
      />

      <ManageTracksDialog
        currentTracks={tracks}
        existingTrackIds={existingTrackIds}
        hasMoreSearchResults={hasMoreSearchResults}
        isLoadingMoreSearch={isLoadingMoreSearch}
        isSearching={isSearching}
        onAddTrack={(track) => {
          setSavingTrackId(track.id);
          saveTrackMutation.mutate({ track });
        }}
        onClose={() => {
          setIsManageTracksOpen(false);
          setSearchQuery("");
          setSearchResults([]);
          setSearchError(null);
        }}
        onPreview={(track) => storePlayTrack(track, [track])}
        onRemoveTrack={(trackId) => {
          setRemovingTrackId(trackId);
          removeTrackFromDialogMutation.mutate({ trackId });
        }}
        onSearch={(q) => void onSearchTracks(q)}
        onSearchQueryChange={setSearchQuery}
        onStopPreview={() => setPlaying(false)}
        open={isManageTracksOpen}
        playlistName={playlist.name}
        previewingTrackId={isPlaying && currentTrack ? currentTrack.id : null}
        removingTrackId={removingTrackId}
        savingTrackId={savingTrackId}
        searchError={searchError}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searchResultsContainerRef={searchResultsContainerRef}
        searchSentinelRef={searchSentinelRef}
        snippetDurationSeconds={10}
      />
    </div>
  );
}
