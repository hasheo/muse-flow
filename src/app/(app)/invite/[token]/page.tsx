"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type InviteInfo = {
  used: boolean;
  expired: boolean;
  type: string;
  playlist: {
    id: string;
    name: string;
    cover: string;
    ownerName: string;
  };
};

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const {
    data: inviteInfo,
    isLoading,
    error,
  } = useQuery<InviteInfo>({
    queryKey: ["invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/invite/${token}`);
      const payload = (await res.json()) as { invite?: InviteInfo; message?: string };
      if (!res.ok) throw new Error(payload.message || "Failed to load invite");
      return payload.invite!;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/invite/${token}`, { method: "POST" });
      const payload = (await res.json()) as { playlist?: { id: string }; message?: string };
      if (!res.ok) throw new Error(payload.message || "Failed to accept invite");
      return payload.playlist;
    },
    onSuccess: (playlist) => {
      if (playlist?.id) {
        router.push(`/library/${playlist.id}`);
      } else {
        router.push("/library");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-white/70">Loading invite...</p>
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-300">
          {error instanceof Error ? error.message : "Invite not found"}
        </p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  if (inviteInfo.used) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-white/70">This invite has already been used.</p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  if (inviteInfo.expired) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-white/70">This invite has expired.</p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6">
      <Image
        alt={inviteInfo.playlist.name}
        className="h-40 w-40 rounded-2xl object-cover"
        height={160}
        src={inviteInfo.playlist.cover}
        unoptimized
        width={160}
      />
      <div className="text-center">
        <h2 className="text-xl font-bold">{inviteInfo.playlist.name}</h2>
        <p className="mt-1 text-sm text-white/50">
          {inviteInfo.playlist.ownerName} invited you to collaborate
        </p>
      </div>

      {acceptMutation.error && (
        <p className="text-sm text-red-300">
          {acceptMutation.error instanceof Error
            ? acceptMutation.error.message
            : "Failed to accept invite"}
        </p>
      )}

      <Button
        disabled={acceptMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        type="button"
      >
        {acceptMutation.isPending ? "Joining..." : "Accept Invite"}
      </Button>
    </div>
  );
}
