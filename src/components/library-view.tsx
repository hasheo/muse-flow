"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchPlaylists, type PlaylistSummary } from "@/lib/playlist";

type PendingInvite = {
  id: string;
  token: string;
  createdAt: string;
  playlist: {
    id: string;
    name: string;
    cover: string;
    ownerName: string;
  };
};

async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const response = await fetch("/api/invites/pending", { cache: "no-store" });
  const payload = (await response.json()) as { invites?: PendingInvite[]; message?: string };
  if (!response.ok) return [];
  return payload.invites ?? [];
}

function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link
      className="group overflow-hidden rounded-2xl border border-white/10 bg-black/35 transition hover:border-lime-300/50"
      href={`/library/${playlist.id}`}
      key={playlist.id}
    >
      <Image
        alt={playlist.name}
        className="h-44 w-full object-cover transition duration-300 group-hover:scale-105"
        height={176}
        src={playlist.cover}
        unoptimized
        width={420}
      />
      <div className="p-4">
        <p className="truncate font-semibold text-white">{playlist.name}</p>
        <div className="flex items-center gap-1 text-sm text-white/65">
          <span>{playlist.trackCount} tracks</span>
          {playlist.role === "collaborator" && playlist.ownerName ? (
            <>
              <span className="mx-1">·</span>
              <Users className="h-3.5 w-3.5" />
              <span className="truncate">{playlist.ownerName}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function LibraryView() {
  const queryClient = useQueryClient();

  const {
    data: playlists = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["pending-invites"],
    queryFn: fetchPendingInvites,
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/playlists/invite/${token}`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Failed to accept invite");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/invites/${token}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Failed to decline invite");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
  });

  const ownedPlaylists = playlists.filter(
    (p) => p.role !== "collaborator",
  );
  const collaborativePlaylists = playlists.filter(
    (p) => p.role === "collaborator",
  );

  if (isLoading) {
    return <p className="text-sm text-white/70">Loading your playlists...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-300">
        {error instanceof Error ? error.message : "Failed to load playlists"}
      </p>
    );
  }

  const isEmpty =
    !pendingInvites.length &&
    !ownedPlaylists.length &&
    !collaborativePlaylists.length;

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <p className="text-lg font-semibold">Your Library is empty</p>
        <p className="mt-2 text-sm text-white/65">
          Create a playlist on the Home page, then save your favorite tracks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Invites */}
      {pendingInvites.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-white/50">
            Pending Invites
          </h2>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3"
                key={invite.id}
              >
                <Image
                  alt={invite.playlist.name}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  height={48}
                  src={invite.playlist.cover}
                  unoptimized
                  width={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">
                    {invite.playlist.name}
                  </p>
                  <p className="text-sm text-white/65">
                    Invited by {invite.playlist.ownerName}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    disabled={
                      acceptInviteMutation.isPending ||
                      declineInviteMutation.isPending
                    }
                    onClick={() => acceptInviteMutation.mutate(invite.token)}
                    type="button"
                  >
                    Accept
                  </Button>
                  <Button
                    disabled={
                      acceptInviteMutation.isPending ||
                      declineInviteMutation.isPending
                    }
                    onClick={() => declineInviteMutation.mutate(invite.token)}
                    type="button"
                    variant="ghost"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* My Playlists */}
      {ownedPlaylists.length > 0 ? (
        <section>
          {collaborativePlaylists.length > 0 ? (
            <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-white/50">
              My Playlists
            </h2>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownedPlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Collaborative Playlists */}
      {collaborativePlaylists.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-white/50">
            Collaborative Playlists
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collaborativePlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
