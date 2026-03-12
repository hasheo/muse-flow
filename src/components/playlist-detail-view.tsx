"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pause, Pencil, Play, Trash2, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_PLAYLIST_COVER } from "@/lib/playlist";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player-store";

type PlaylistDetail = {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
};

type PlaylistDetailResponse = {
  playlist?: PlaylistDetail;
  tracks?: Track[];
  message?: string;
};

async function fetchPlaylistTracks(playlistId: string) {
  const response = await fetch(`/api/playlists/${playlistId}`, { cache: "no-store" });
  const payload = (await response.json()) as PlaylistDetailResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Failed to fetch playlist tracks");
  }

  return payload;
}

function formatTotalDuration(tracks: Track[]) {
  const totalSeconds = tracks.reduce((sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function PlaylistDetailView({ playlistId }: { playlistId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setTracks = usePlayerStore((state) => state.setTracks);
  const setTrack = usePlayerStore((state) => state.setTrack);
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
      setActionError(null);
      setActionMessage("Track removed from playlist.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      setActionMessage(null);
      setActionError(e instanceof Error ? e.message : "Failed to delete track");
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
      setActionError(null);
      setActionMessage("Track order updated.");
      await queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] });
    },
    onError: (e) => {
      setActionMessage(null);
      setActionError(e instanceof Error ? e.message : "Failed to reorder playlist");
      void queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] });
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
      setActionError(null);
      setActionMessage("Playlist updated.");
      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: (e) => {
      setActionMessage(null);
      setActionError(e instanceof Error ? e.message : "Failed to update playlist");
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
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
      setActionMessage(null);
      setActionError(e instanceof Error ? e.message : "Failed to delete playlist");
    },
  });

  if (isLoading) {
    return <p className="text-sm text-white/70">Loading playlist...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-300">{error instanceof Error ? error.message : "Failed to load playlist"}</p>;
  }

  if (!playlistDetail?.playlist) {
    return <p className="text-sm text-white/70">Playlist not found.</p>;
  }

  const playlist = playlistDetail.playlist;

  const isPlaylistPlaying = isPlaying && currentTrack != null && tracks.some((t) => t.id === currentTrack.id);

  const togglePlayAll = () => {
    if (tracks.length === 0) return;
    if (isPlaylistPlaying) {
      setPlaying(false);
    } else if (currentTrack && tracks.some((t) => t.id === currentTrack.id)) {
      setPlaying(true);
    } else {
      setTracks(tracks);
      setTrack(tracks[0]);
      setPlaying(true);
    }
  };

  return (
    <div>
      <Link className="mb-6 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white" href="/library">
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      {actionMessage ? (
        <p aria-atomic="true" aria-live="polite" className="mb-4 px-1 text-sm text-lime-300" role="status">
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p aria-atomic="true" aria-live="assertive" className="mb-4 px-1 text-sm text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left: Playlist info */}
        <div className="flex shrink-0 flex-col items-center lg:w-72 lg:items-start">
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
                const cover = String(formData.get("playlistCover") ?? "").trim();
                if (!name) {
                  setActionMessage(null);
                  setActionError("Playlist name cannot be empty.");
                  return;
                }
                updatePlaylistMutation.mutate({ name, cover: cover || DEFAULT_PLAYLIST_COVER });
              }}
            >
              <Input defaultValue={playlist.name} key={`${playlist.id}-name`} name="playlistName" placeholder="Playlist name" />
              <Input defaultValue={playlist.cover} key={`${playlist.id}-cover`} name="playlistCover" placeholder="Cover URL" />
              <div className="flex gap-2">
                <Button className="flex-1" disabled={updatePlaylistMutation.isPending} type="submit">
                  {updatePlaylistMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button onClick={() => setIsEditing(false)} type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-5 w-full text-center lg:text-left">
              <h2 className="text-2xl font-bold tracking-tight">{playlist.name}</h2>
              <p className="mt-1 text-sm text-white/50">
                {tracks.length} {tracks.length === 1 ? "song" : "songs"}
                {tracks.length > 0 ? ` \u00B7 ${formatTotalDuration(tracks)}` : ""}
              </p>
            </div>
          )}

          {!isEditing ? (
            <div className="mt-5 flex items-center gap-3">
              <button
                className="grid h-14 w-14 place-items-center rounded-full bg-white text-black transition hover:scale-105 hover:bg-white/90 disabled:opacity-50"
                disabled={tracks.length === 0}
                onClick={togglePlayAll}
                type="button"
              >
                {isPlaylistPlaying ? (
                  <Pause className="h-6 w-6" fill="currentColor" />
                ) : (
                  <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
                )}
              </button>
              <button
                className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                onClick={() => setIsEditing(true)}
                type="button"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-red-400/60 hover:text-red-400"
                disabled={deletePlaylistMutation.isPending}
                onClick={() => setIsDeleteConfirmOpen(true)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        {/* Right: Track list */}
        <div className="min-w-0 flex-1">
          {!tracks.length ? (
            <p className="py-10 text-center text-sm text-white/50">This playlist has no tracks yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {tracks.map((track) => {
                const active = currentTrack?.id === track.id;

                return (
                  <div
                    className={`group flex cursor-pointer items-center gap-4 rounded-lg px-3 py-2.5 transition ${
                      active ? "bg-white/10" : "hover:bg-white/[0.06]"
                    }`}
                    draggable
                    key={`${playlistId}-${track.id}`}
                    onClick={() => {
                      setTracks(tracks);
                      setTrack(track);
                      setPlaying(true);
                    }}
                    onDragEnd={() => setDraggingTrackId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => setDraggingTrackId(track.id)}
                    onDrop={() => {
                      if (!draggingTrackId || draggingTrackId === track.id) return;

                      const sourceIndex = tracks.findIndex((item) => item.id === draggingTrackId);
                      const targetIndex = tracks.findIndex((item) => item.id === track.id);
                      if (sourceIndex < 0 || targetIndex < 0) return;

                      const nextTracks = [...tracks];
                      const [dragged] = nextTracks.splice(sourceIndex, 1);
                      nextTracks.splice(targetIndex, 0, dragged);

                      queryClient.setQueryData<PlaylistDetailResponse>(["playlist-tracks", playlistId], (prev) => {
                        if (!prev) return prev;
                        return { ...prev, tracks: nextTracks };
                      });

                      setDraggingTrackId(null);
                      reorderTracksMutation.mutate({ trackIds: nextTracks.map((item) => item.id) });
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
                        <Play className="h-5 w-5 text-white" fill="currentColor" />
                      </div>
                    </div>

                    {/* Title & artist */}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${active ? "text-lime-400" : "text-white"}`}>
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {track.artist}
                        {track.album ? ` \u00B7 ${track.album}` : ""}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      className="shrink-0 text-white/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                      disabled={deletingTrackId === track.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTrackId(track.id);
                        setActionError(null);
                        deleteTrackMutation.mutate({ trackId: track.id });
                      }}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

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
          setActionError(null);
          deletePlaylistMutation.mutate();
        }}
        open={isDeleteConfirmOpen}
        title="Delete this playlist?"
      />
    </div>
  );
}
