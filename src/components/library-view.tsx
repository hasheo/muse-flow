"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { fetchPlaylists } from "@/lib/playlist";

export function LibraryView() {
  const {
    data: playlists = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });

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

  if (!playlists.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <p className="text-lg font-semibold">Your Library is empty</p>
        <p className="mt-2 text-sm text-white/65">
          Buat playlist dulu dari halaman Home, lalu simpan lagu favoritmu.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {playlists.map((playlist) => (
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
           
            width={420}
          />
          <div className="p-4">
            <p className="truncate font-semibold text-white">{playlist.name}</p>
            <p className="text-sm text-white/65">{playlist.trackCount} tracks</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
