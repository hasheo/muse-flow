"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Gamepad2, Headphones, Home, Library, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import type { Track } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player-store";

async function fetchTracks() {
  const response = await fetch("/api/tracks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch tracks");
  }
  return (await response.json()) as { tracks: Track[] };
}

export function Sidebar() {
  const setTracks = usePlayerStore((state) => state.setTracks);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const pathname = usePathname();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["tracks"],
    queryFn: fetchTracks,
    select: (payload) => payload.tracks,
  });

  useEffect(() => {
    if (data) {
      setTracks(data);
    }
  }, [data, setTracks]);

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-black/30 p-4 lg:block">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-400 font-bold text-black">
          M
        </div>
        <p className="text-lg font-semibold tracking-tight">MuseFlow</p>
      </div>
      <nav className="space-y-2 text-sm">
        <Link
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white",
            pathname === "/app" && "bg-white/10 text-white",
          )}
          href="/app"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>

        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white"
          onClick={() => {
            if (pathname !== "/app") {
              router.push("/app?focus=search");
              return;
            }
            window.dispatchEvent(new CustomEvent("focus-search"));
          }}
          type="button"
        >
          <Search className="h-4 w-4" />
          Search
        </button>

        <Link
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white",
            pathname.startsWith("/library") && "bg-white/10 text-white",
          )}
          href="/library"
        >
          <Library className="h-4 w-4" />
          Your Library
        </Link>

        <Link
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white",
            (pathname === "/quiz" || pathname.startsWith("/quiz/")) && "bg-white/10 text-white",
          )}
          href="/quiz"
        >
          <Gamepad2 className="h-4 w-4" />
          Quiz
        </Link>

        <Link
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white",
            pathname.startsWith("/quiz-companion") && "bg-white/10 text-white",
          )}
          href="/quiz-companion"
        >
          <Headphones className="h-4 w-4" />
          Quiz Companion
        </Link>

        <div
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70"
        >
          <BarChart3 className="h-4 w-4" />
          Charts
        </div>
      </nav>
      {currentTrack ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase text-white/50">Now playing</p>
          <div className="mt-2 flex items-center gap-3">
            <Image alt={currentTrack.title} className="h-10 w-10 rounded-md object-cover" height={40} src={currentTrack.cover} width={40} />
            <div className="min-w-0">
              <p className="truncate font-medium">{currentTrack.title}</p>
              <p className="truncate text-sm text-white/70">{currentTrack.artist}</p>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
