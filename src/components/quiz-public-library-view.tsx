"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Gamepad2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SkeletonPlaylistGrid } from "@/components/ui/skeleton";
import { coerceQuizAnswerMode, getQuizAnswerModeLabel } from "@/lib/quiz-answer-mode";
import {
  coerceQuizDifficulty,
  getQuizDifficultyLabel,
  QUIZ_DIFFICULTY_OPTIONS,
  type QuizDifficulty,
} from "@/lib/quiz-difficulty";

type PublicQuizPlaylist = {
  id: string;
  name: string;
  cover: string;
  isQuiz: boolean;
  isPublic: boolean;
  difficulty: string;
  answerMode: string;
  ownerName: string;
  trackCount: number;
  updatedAt: string;
};

type SortOption =
  | "newest"
  | "oldest"
  | "tracks_desc"
  | "tracks_asc"
  | "name_asc"
  | "name_desc";

const MIN_TRACK_OPTIONS = [0, 5, 10, 20] as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function fetchPublicQuizPlaylists() {
  const response = await fetch("/api/playlists/public", { cache: "no-store" });
  const payload = (await response.json()) as {
    playlists?: PublicQuizPlaylist[];
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || "Failed to fetch public quiz playlists");
  }

  return payload.playlists ?? [];
}

export function QuizPublicLibraryView() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<QuizDifficulty | "all">("all");
  const [minTracks, setMinTracks] = useState<(typeof MIN_TRACK_OPTIONS)[number]>(0);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const {
    data: playlists = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-quiz-playlists"],
    queryFn: fetchPublicQuizPlaylists,
  });

  const filteredPlaylists = useMemo(() => {
    const normalizedQuery = normalizeText(searchQuery);
    const filtered = playlists.filter((playlist) => {
      const playlistDifficulty = coerceQuizDifficulty(playlist.difficulty);
      if (difficultyFilter !== "all" && playlistDifficulty !== difficultyFilter) {
        return false;
      }

      if (playlist.trackCount < minTracks) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = normalizeText(`${playlist.name} ${playlist.ownerName}`);
      return haystack.includes(normalizedQuery);
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (sortBy === "newest") {
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }
      if (sortBy === "oldest") {
        return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
      }
      if (sortBy === "tracks_desc") {
        return right.trackCount - left.trackCount;
      }
      if (sortBy === "tracks_asc") {
        return left.trackCount - right.trackCount;
      }
      if (sortBy === "name_desc") {
        return right.name.localeCompare(left.name);
      }
      return left.name.localeCompare(right.name);
    });

    return sorted;
  }, [difficultyFilter, minTracks, playlists, searchQuery, sortBy]);

  if (isLoading) {
    return <SkeletonPlaylistGrid count={6} />;
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load public quiz playlists"}
        onRetry={() => void queryClient.invalidateQueries({ queryKey: ["public-quiz-playlists"] })}
      />
    );
  }

  if (!playlists.length) {
    return (
      <EmptyState
        description="Create a quiz playlist and enable public mode from the Quiz Setup page."
        icon={<Gamepad2 />}
        title="No Public Quiz Playlists Yet"
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Explore Public Quiz</p>
        <div className="mt-3 grid gap-2 grid-cols-2 lg:grid-cols-4">
          <Input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search quiz name or owner..."
            value={searchQuery}
          />
          <select
            className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
            onChange={(event) => setDifficultyFilter(event.target.value as QuizDifficulty | "all")}
            value={difficultyFilter}
          >
            <option className="text-black" value="all">
              All difficulties
            </option>
            {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
              <option className="text-black" key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
            onChange={(event) => setMinTracks(Number(event.target.value) as (typeof MIN_TRACK_OPTIONS)[number])}
            value={minTracks}
          >
            {MIN_TRACK_OPTIONS.map((value) => (
              <option className="text-black" key={value} value={value}>
                {value === 0 ? "Any track count" : `${value}+ tracks`}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            value={sortBy}
          >
            <option className="text-black" value="newest">
              Newest
            </option>
            <option className="text-black" value="oldest">
              Oldest
            </option>
            <option className="text-black" value="tracks_desc">
              Most tracks
            </option>
            <option className="text-black" value="tracks_asc">
              Fewest tracks
            </option>
            <option className="text-black" value="name_asc">
              Name A-Z
            </option>
            <option className="text-black" value="name_desc">
              Name Z-A
            </option>
          </select>
        </div>
      </section>

      {!filteredPlaylists.length ? (
        <EmptyState
          description="Try changing the search or filters."
          icon={<Search />}
          title="No matching quizzes"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPlaylists.map((playlist) => (
          <Link
            className="group overflow-hidden rounded-2xl border border-white/10 bg-black/35 transition hover:border-lime-300/50"
            href={`/quiz/play/${playlist.id}`}
            key={playlist.id}
          >
            <Image
              alt={playlist.name}
              className="h-32 w-full object-cover transition duration-300 group-hover:scale-105 sm:h-44"
              height={176}
              src={playlist.cover}
             
              width={420}
            />
            <div className="space-y-2 p-4">
              <p className="truncate font-semibold text-white">{playlist.name}</p>
              <p className="truncate text-sm text-white/65">Created by: {playlist.ownerName}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-lime-300/40 bg-lime-300/10 px-2 py-1 text-xs text-lime-200">
                  {getQuizDifficultyLabel(coerceQuizDifficulty(playlist.difficulty))}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80">
                  {playlist.trackCount} tracks
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80">
                  {getQuizAnswerModeLabel(coerceQuizAnswerMode(playlist.answerMode))}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
