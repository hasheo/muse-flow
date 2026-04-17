"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Gamepad2, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

function QuizCard({ playlist }: { playlist: PublicQuizPlaylist }) {
  return (
    <Link
      className="group relative flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 transition hover:-translate-y-1 hover:border-lime-300/50 sm:w-64"
      href={`/quiz/play/${playlist.id}`}
    >
      <div className="relative h-36 w-full overflow-hidden sm:h-40">
        <Image
          alt={playlist.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
          height={176}
          src={playlist.cover}
          unoptimized
          width={256}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-lime-400 text-black opacity-0 shadow-lg shadow-lime-500/40 transition group-hover:opacity-100">
          <Play className="h-4 w-4 fill-current" />
        </div>
        <span className="absolute bottom-2 left-2 rounded-full border border-lime-300/40 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-200 backdrop-blur">
          {getQuizDifficultyLabel(coerceQuizDifficulty(playlist.difficulty))}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-black text-white">{playlist.name}</p>
        <p className="truncate text-xs text-white/55">by {playlist.ownerName}</p>
        <div className="mt-auto flex items-center gap-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
          <span>{playlist.trackCount} tracks</span>
          <span>•</span>
          <span>{getQuizAnswerModeLabel(coerceQuizAnswerMode(playlist.answerMode))}</span>
        </div>
      </div>
    </Link>
  );
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
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-10 w-full max-w-xs rounded-full border-white/15 bg-white/5 pl-4 text-sm placeholder-white/40"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search quizzes or owners..."
          value={searchQuery}
        />
        <select
          className="h-10 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
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
          className="h-10 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
          onChange={(event) =>
            setMinTracks(Number(event.target.value) as (typeof MIN_TRACK_OPTIONS)[number])
          }
          value={minTracks}
        >
          {MIN_TRACK_OPTIONS.map((value) => (
            <option className="text-black" key={value} value={value}>
              {value === 0 ? "Any length" : `${value}+ tracks`}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
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

      {!filteredPlaylists.length ? (
        <EmptyState
          description="Try changing the search or filters."
          icon={<Search />}
          title="No matching quizzes"
        />
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {filteredPlaylists.map((playlist) => (
            <QuizCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  );
}
