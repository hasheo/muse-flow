"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import type { Track } from "@/lib/catalog";
import {
  DEFAULT_QUIZ_DIFFICULTY,
  getQuizDifficultyLabel,
  getSnippetDurationSeconds,
  pickSnippetStart,
  QUIZ_DIFFICULTY_OPTIONS,
  type QuizDifficulty,
} from "@/lib/quiz-difficulty";
import { DEFAULT_PLAYLIST_COVER, fetchPlaylists } from "@/lib/playlist";
import { type QuizPlaylistSummary } from "@/lib/quiz-types";
import { shuffleTracks, QUIZ_PLAYER_VARS } from "@/lib/quiz-utils";
import { usePlayerStore } from "@/store/player-store";

type PlaylistDetailResponse = {
  playlist?: {
    id: string;
    name: string;
    cover: string;
    isQuiz: boolean;
    difficulty: QuizDifficulty;
    trackCount: number;
  };
  tracks?: Track[];
  message?: string;
};

type CompanionPhase = "setup" | "playing" | "finished";

async function fetchPlaylistTracks(playlistId: string) {
  const response = await fetch(`/api/playlists/${playlistId}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as PlaylistDetailResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Failed to load playlist tracks");
  }

  return payload;
}

async function setQuizSettings(playlistId: string, difficulty: QuizDifficulty) {
  const response = await fetch(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isQuiz: true, difficulty }),
  });
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Failed to update quiz settings");
  }
}

async function createQuizPlaylist(
  name: string,
  difficulty: QuizDifficulty,
  cover?: string,
) {
  const response = await fetch("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      cover: cover || DEFAULT_PLAYLIST_COVER,
      isQuiz: true,
      difficulty,
    }),
  });

  const payload = (await response.json()) as {
    playlist?: QuizPlaylistSummary;
    message?: string;
  };
  if (!response.ok || !payload.playlist) {
    throw new Error(payload.message || "Failed to create quiz playlist");
  }

  return payload.playlist;
}

export function QuizCompanionView() {
  const queryClient = useQueryClient();
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [phase, setPhase] = useState<CompanionPhase>("setup");
  const [quizTracks, setQuizTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSnippetStart, setCurrentSnippetStart] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [difficultyOverride, setDifficultyOverride] = useState<QuizDifficulty | null>(null);

  const {
    playerRef: mainPlayerRef,
    readyRef: mainReadyRef,
    containerRef: mainContainerRef,
  } = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });
  const {
    playerRef: preloadPlayerRef,
    readyRef: preloadReadyRef,
    containerRef: preloadContainerRef,
  } = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });

  const snippetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedTrackIdRef = useRef<string | null>(null);

  const { data: playlists = [], isLoading: isPlaylistsLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists() as Promise<QuizPlaylistSummary[]>,
  });

  const activePlaylistId = selectedPlaylistId || playlists[0]?.id || "";
  const selectedPlaylist = playlists.find((playlist) => playlist.id === activePlaylistId);
  const playlistDifficulty = selectedPlaylist?.difficulty ?? DEFAULT_QUIZ_DIFFICULTY;
  const difficulty = difficultyOverride ?? playlistDifficulty;
  const currentTrack = quizTracks[currentIndex] ?? null;
  const snippetDurationSeconds = getSnippetDurationSeconds(difficulty);

  const clearSnippetTimer = useCallback(() => {
    if (snippetTimeoutRef.current) {
      clearTimeout(snippetTimeoutRef.current);
      snippetTimeoutRef.current = null;
    }
  }, []);

  const stopCompanionAudio = useCallback(() => {
    mainPlayerRef.current?.pauseVideo();
  }, [mainPlayerRef]);

  const createPlaylistMutation = useMutation({
    mutationFn: ({
      name,
      cover,
      difficulty,
    }: {
      name: string;
      cover?: string;
      difficulty: QuizDifficulty;
    }) => createQuizPlaylist(name, difficulty, cover),
    onSuccess: async (playlist) => {
      setIsCreateDialogOpen(false);
      setSelectedPlaylistId(playlist.id);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to create quiz playlist.",
      );
    },
  });

  const saveQuizSettingsMutation = useMutation({
    mutationFn: ({ playlistId, difficulty }: { playlistId: string; difficulty: QuizDifficulty }) =>
      setQuizSettings(playlistId, difficulty),
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to set quiz settings.");
    },
  });

  useEffect(() => {
    return () => {
      clearSnippetTimer();
      stopCompanionAudio();
    };
  }, [clearSnippetTimer, stopCompanionAudio]);

  useEffect(() => {
    setPlaying(false);
  }, [setPlaying]);

  const playSnippet = useCallback(async (track: Track, startAt: number) => {
    if (!mainPlayerRef.current || !mainReadyRef.current) {
      throw new Error("YouTube player is not ready yet.");
    }
    mainPlayerRef.current.loadVideoById(track.youtubeVideoId, startAt);
  }, [mainPlayerRef, mainReadyRef]);

  const preloadTrackMetadata = useCallback((track: Track | null) => {
    if (!track) {
      return;
    }
    if (preloadedTrackIdRef.current === track.id) {
      return;
    }
    preloadedTrackIdRef.current = track.id;

    if (!preloadPlayerRef.current || !preloadReadyRef.current) {
      return;
    }
    if (preloadPlayerRef.current.cueVideoById) {
      preloadPlayerRef.current.cueVideoById(track.youtubeVideoId, 0);
      return;
    }
    preloadPlayerRef.current.loadVideoById(track.youtubeVideoId, 0);
    preloadPlayerRef.current.pauseVideo();
  }, [preloadPlayerRef, preloadReadyRef]);

  const playQuestionSnippet = useCallback(
    async (track: Track, snippetStart: number) => {
      clearSnippetTimer();
      stopCompanionAudio();
      setErrorMessage(null);
      try {
        await playSnippet(track, snippetStart);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to play snippet.",
        );
        return;
      }

      snippetTimeoutRef.current = setTimeout(() => {
        stopCompanionAudio();
      }, snippetDurationSeconds * 1000);
    },
    [clearSnippetTimer, playSnippet, snippetDurationSeconds, stopCompanionAudio],
  );

  const runQuestion = useCallback(
    async (index: number, tracksPool: Track[]) => {
      const track = tracksPool[index];
      if (!track) {
        setPhase("finished");
        clearSnippetTimer();
        stopCompanionAudio();
        return;
      }

      const snippetStart = pickSnippetStart(track.duration, snippetDurationSeconds);
      setCurrentIndex(index);
      setCurrentSnippetStart(snippetStart);
      setPhase("playing");
      await playQuestionSnippet(track, snippetStart);
      preloadTrackMetadata(tracksPool[index + 1] ?? null);
    },
    [clearSnippetTimer, playQuestionSnippet, preloadTrackMetadata, snippetDurationSeconds, stopCompanionAudio],
  );

  const startCompanion = async () => {
    if (!activePlaylistId) {
      setErrorMessage("Please select a playlist first.");
      return;
    }

    setErrorMessage(null);
    clearSnippetTimer();
    stopCompanionAudio();

    let payload: PlaylistDetailResponse;
    try {
      payload = await fetchPlaylistTracks(activePlaylistId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load selected playlist.",
      );
      return;
    }

    const tracks = payload.tracks ?? [];
    if (tracks.length < 1) {
      setErrorMessage("This playlist has no tracks for companion.");
      return;
    }

    const shuffled = shuffleTracks(tracks);
    setQuizTracks(shuffled);
    await runQuestion(0, shuffled);
  };

  const replaySnippet = async () => {
    if (!currentTrack) {
      return;
    }
    await playQuestionSnippet(currentTrack, currentSnippetStart);
  };

  const nextQuestion = async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= quizTracks.length) {
      setPhase("finished");
      clearSnippetTimer();
      stopCompanionAudio();
      return;
    }
    await runQuestion(nextIndex, quizTracks);
  };

  const previousQuestion = async () => {
    if (currentIndex <= 0) {
      return;
    }
    await runQuestion(currentIndex - 1, quizTracks);
  };

  const restartCompanion = async () => {
    if (!quizTracks.length) {
      setPhase("setup");
      return;
    }

    const reshuffled = shuffleTracks(quizTracks);
    setQuizTracks(reshuffled);
    await runQuestion(0, reshuffled);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          Quiz Companion Setup
        </p>

        {phase === "setup" ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <select
                className="h-10 min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
                onChange={(event) => {
                  setSelectedPlaylistId(event.target.value);
                  setDifficultyOverride(null);
                }}
                value={activePlaylistId}
              >
                <option className="text-black" value="">
                  Select playlist...
                </option>
                {playlists.map((playlist) => (
                  <option
                    className="text-black"
                    key={playlist.id}
                    value={playlist.id}
                  >
                    {playlist.name} ({playlist.trackCount}){" "}
                    {playlist.isQuiz ? "[Quiz]" : ""} [{getQuizDifficultyLabel(playlist.difficulty)}]
                  </option>
                ))}
              </select>

              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                type="button"
                variant="ghost"
              >
                + New
              </Button>
            </div>

            <CreatePlaylistDialog
              open={isCreateDialogOpen}
              isCreating={createPlaylistMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
              onConfirm={(name, cover) => {
                createPlaylistMutation.mutate({
                  name,
                  cover: cover || undefined,
                  difficulty,
                });
              }}
            />

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Difficulty</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    className={`rounded-md border px-3 py-2.5 text-sm transition ${
                      difficulty === option.value
                        ? "border-lime-400/70 bg-lime-400/20 text-lime-100"
                        : "border-white/15 bg-white/5 text-white/80 hover:border-white/30"
                    }`}
                    key={option.value}
                    onClick={() => setDifficultyOverride(option.value)}
                    type="button"
                  >
                    {option.label} ({option.snippetSeconds}s)
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                disabled={!activePlaylistId || saveQuizSettingsMutation.isPending}
                onClick={() => {
                  if (!activePlaylistId) {
                    setErrorMessage("Please select a playlist first.");
                    return;
                  }
                  setErrorMessage(null);
                  saveQuizSettingsMutation.mutate({
                    playlistId: activePlaylistId,
                    difficulty,
                  });
                }}
                type="button"
                variant="ghost"
              >
                {saveQuizSettingsMutation.isPending ? "Saving..." : "Save Quiz Settings"}
              </Button>
              <Button
                disabled={isPlaylistsLoading}
                onClick={() => void startCompanion()}
                type="button"
              >
                Start Companion
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "playing" && currentTrack ? (
          <div className="mt-4 flex flex-col items-center space-y-5">
            <p className="text-sm text-white/50">
              Question {currentIndex + 1} of {quizTracks.length}
            </p>

            <Image
              alt={currentTrack.title}
              className="aspect-square w-56 rounded-2xl object-cover shadow-lg shadow-black/40 sm:w-64"
              height={256}
              src={currentTrack.cover}
              unoptimized
              width={256}
            />

            <div className="w-full text-center">
              <p className="truncate text-lg font-bold text-white">{currentTrack.title}</p>
              <p className="truncate text-sm text-white/50">{currentTrack.artist}</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                disabled={currentIndex <= 0}
                onClick={() => void previousQuestion()}
                type="button"
                variant="ghost"
              >
                Previous Question
              </Button>
              <Button
                onClick={() => void replaySnippet()}
                type="button"
                variant="ghost"
              >
                Play Snippet
              </Button>
              <Button onClick={() => void nextQuestion()} type="button">
                {currentIndex + 1 >= quizTracks.length
                  ? "Finish"
                  : "Next Question"}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "finished" ? (
          <div className="mt-3 space-y-2">
            <p className="text-lg font-semibold">Companion finished</p>
            <p className="text-sm text-white/70">
              All questions have been played ({quizTracks.length} tracks).
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => void restartCompanion()}
                type="button"
                variant="ghost"
              >
                Play Again
              </Button>
              <Button onClick={() => setPhase("setup")} type="button">
                Back to Setup
              </Button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 text-sm text-red-300">{errorMessage}</p>
        ) : null}
      </section>

      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={mainContainerRef} />
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={preloadContainerRef} />
    </div>
  );
}
