"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Trash2 } from "lucide-react";
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

export function PlaylistDetailView({ playlistId }: { playlistId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
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

  return (
    <div className="space-y-4">
      <Link className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white" href="/library">
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <Image
            alt={playlist.name}
            className="h-44 w-full rounded-xl object-cover"
            height={176}
            src={playlist.cover}
            unoptimized
            width={320}
          />
          <form
            className="space-y-3"
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

              updatePlaylistMutation.mutate({
                name,
                cover: cover || DEFAULT_PLAYLIST_COVER,
              });
            }}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Playlist</p>
              <h2 className="text-3xl font-bold tracking-tight">{playlist.name}</h2>
            </div>
            <Input defaultValue={playlist.name} key={`${playlist.id}-name`} name="playlistName" />
            <Input defaultValue={playlist.cover} key={`${playlist.id}-cover`} name="playlistCover" />
            <div className="flex gap-2">
              <Button disabled={updatePlaylistMutation.isPending} type="submit" variant="ghost">
                {updatePlaylistMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                disabled={deletePlaylistMutation.isPending}
                onClick={() => {
                  setIsDeleteConfirmOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                {deletePlaylistMutation.isPending ? "Deleting..." : "Delete Playlist"}
              </Button>
            </div>
          </form>
        </div>
      </section>

      {actionMessage ? (
        <p aria-atomic="true" aria-live="polite" className="px-1 text-sm text-lime-300" role="status">
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p aria-atomic="true" aria-live="assertive" className="px-1 text-sm text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/35 p-3">
        <div className="grid grid-cols-[2.2fr_1.2fr_0.7fr_auto] border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/45">
          <span>Title</span>
          <span>Album</span>
          <span className="text-right">Time</span>
          <span className="text-right">Action</span>
        </div>

        {!tracks.length ? <p className="px-4 py-4 text-sm text-white/65">This playlist has no tracks yet.</p> : null}

        {tracks.map((track) => {
          const active = currentTrack?.id === track.id;

          return (
            <div
              className={`grid w-full grid-cols-[2.2fr_1.2fr_0.7fr_auto] items-center gap-2 px-4 py-3 transition ${
                active ? "bg-white/10" : "hover:bg-white/10"
              }`}
              draggable
              key={`${playlistId}-${track.id}`}
              onDragEnd={() => setDraggingTrackId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggingTrackId(track.id)}
              onDrop={() => {
                if (!draggingTrackId || draggingTrackId === track.id) {
                  return;
                }

                const sourceIndex = tracks.findIndex((item) => item.id === draggingTrackId);
                const targetIndex = tracks.findIndex((item) => item.id === track.id);
                if (sourceIndex < 0 || targetIndex < 0) {
                  return;
                }

                const nextTracks = [...tracks];
                const [dragged] = nextTracks.splice(sourceIndex, 1);
                nextTracks.splice(targetIndex, 0, dragged);

                queryClient.setQueryData<PlaylistDetailResponse>(["playlist-tracks", playlistId], (prev) => {
                  if (!prev) {
                    return prev;
                  }

                  return {
                    ...prev,
                    tracks: nextTracks,
                  };
                });

                setDraggingTrackId(null);
                reorderTracksMutation.mutate({ trackIds: nextTracks.map((item) => item.id) });
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Image
                    alt={track.title}
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    height={40}
                    src={track.cover}
                    unoptimized
                    width={40}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{track.title}</p>
                    <p className="truncate text-sm text-white/65">{track.artist}</p>
                  </div>
                </div>
              </div>
              <p className="truncate text-sm text-white/65">{track.album}</p>
              <p className="text-right text-sm text-white/65">{formatDuration(track.duration)}</p>
              <div className="flex justify-end gap-2">
                <Button
                  className="h-8 px-3"
                  disabled={deletingTrackId === track.id}
                  onClick={() => {
                    setTracks(tracks);
                    setTrack(track);
                    setPlaying(true);
                  }}
                  type="button"
                >
                  <Play className="mr-1 h-4 w-4" />
                  Play
                </Button>
                <Button
                  className="h-8 px-3"
                  disabled={deletingTrackId === track.id}
                  onClick={() => {
                    setDeletingTrackId(track.id);
                    setActionError(null);
                    deleteTrackMutation.mutate({ trackId: track.id });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {deletingTrackId === track.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          );
        })}
      </section>
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete Playlist"
        description={`Playlist "${playlist.name}" and all its tracks will be permanently deleted.`}
        isConfirming={deletePlaylistMutation.isPending}
        onCancel={() => {
          if (deletePlaylistMutation.isPending) {
            return;
          }
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
