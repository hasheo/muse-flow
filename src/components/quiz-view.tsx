"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import type { Track } from "@/lib/catalog";
import {
  coerceQuizDifficulty,
  DEFAULT_QUIZ_DIFFICULTY,
  getQuizDifficultyLabel,
  getSnippetDurationSeconds,
  pickSnippetStart,
  QUIZ_DIFFICULTY_OPTIONS,
  type QuizDifficulty,
} from "@/lib/quiz-difficulty";
import {
  coerceQuizAnswerMode,
  getQuizAnswerModeLabel,
  DEFAULT_QUIZ_ANSWER_MODE,
  QUIZ_ANSWER_MODE_OPTIONS,
  type QuizAnswerMode,
} from "@/lib/quiz-answer-mode";
import { DEFAULT_PLAYLIST_COVER, fetchPlaylists } from "@/lib/playlist";
import { useQuizTimers } from "@/hooks/use-quiz-timers";
import { useQuizPlayers } from "@/hooks/use-quiz-players";
import { useQuizSnippetPlayback } from "@/hooks/use-quiz-snippet-playback";
import { usePlayerStore } from "@/store/player-store";
import { isQuizAnswerCorrect } from "@/lib/quiz-text";
import {
  type PlaylistDetailResponse,
  type QuizPlaylistSummary,
  type QuizToast,
  type QuestionReview,
  type QuizAttemptAnswer,
} from "@/lib/quiz-types";
import { fetchPlaylistTracks, saveQuizAttempt, isTokenExpiredError, fetchQuizAttempts } from "@/lib/quiz-api";
import { shuffleTracks, buildMultipleChoiceOptions, getTimerAnnouncement } from "@/lib/quiz-utils";

type QuizPhase = "setup" | "playing" | "answering" | "revealed" | "finished";

async function setPlaylistPublic(playlistId: string, isPublic: boolean) {
  const response = await fetch(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPublic }),
  });
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Failed to update playlist visibility");
  }
}

async function setQuizSettings(playlistId: string, difficulty: QuizDifficulty, answerMode: QuizAnswerMode) {
  const response = await fetch(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty, answerMode }),
  });
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Failed to update quiz settings");
  }
}

async function createQuizPlaylist(
  name: string,
  difficulty: QuizDifficulty,
  answerMode: QuizAnswerMode,
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
      answerMode,
    }),
  });

  const payload = (await response.json()) as { playlist?: QuizPlaylistSummary; message?: string };
  if (!response.ok || !payload.playlist) {
    throw new Error(payload.message || "Failed to create quiz playlist");
  }

  return payload.playlist;
}

export function QuizView() {
  const queryClient = useQueryClient();
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistCover, setNewPlaylistCover] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNextPageToken, setSearchNextPageToken] = useState<string | null>(null);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const [removingTrackId, setRemovingTrackId] = useState<string | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);

  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [quizTracks, setQuizTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [answerInput, setAnswerInput] = useState("");
  const [lastResult, setLastResult] = useState<null | boolean>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<QuizToast>(null);
  const [difficultyOverride, setDifficultyOverride] = useState<QuizDifficulty | null>(null);
  const [answerModeOverride, setAnswerModeOverride] = useState<QuizAnswerMode | null>(null);
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [reviewEntries, setReviewEntries] = useState<QuestionReview[]>([]);
  const [activeQuizPlaylistId, setActiveQuizPlaylistId] = useState<string | null>(null);
  const [activeQuizSessionToken, setActiveQuizSessionToken] = useState<string | null>(null);
  const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState(false);
  const [isFinishingQuiz, setIsFinishingQuiz] = useState(false);

  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
  const searchResultsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const loadMoreAbortControllerRef = useRef<AbortController | null>(null);
  const searchGenerationRef = useRef(0);

  const { clearTimers, cancelPendingSnippetStart, pendingSnippetStartRef, snippetTimeoutRef, answerIntervalRef } = useQuizTimers();
  const { mainPlayerRef, mainContainerRef, preloadPlayerRef, preloadReadyRef, preloadContainerRef, stopQuizAudio } = useQuizPlayers({ pendingSnippetStartRef, cancelPendingSnippetStart });
  const { playSnippet, preloadTrackMetadata } = useQuizSnippetPlayback({ mainPlayerRef, preloadPlayerRef, preloadReadyRef, pendingSnippetStartRef, cancelPendingSnippetStart });

  const { data: playlists = [], isLoading: isPlaylistsLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists<QuizPlaylistSummary>(),
  });
  const activePlaylistId = selectedPlaylistId || playlists[0]?.id || "";
  const selectedPlaylist = playlists.find((playlist) => playlist.id === activePlaylistId);
  const playlistDifficulty = selectedPlaylist?.difficulty ?? DEFAULT_QUIZ_DIFFICULTY;
  const playlistAnswerMode = selectedPlaylist?.answerMode ?? DEFAULT_QUIZ_ANSWER_MODE;
  const difficulty = difficultyOverride ?? playlistDifficulty;
  const answerMode = answerModeOverride ?? playlistAnswerMode;

  const { data: activePlaylistData } = useQuery({
    queryKey: ["quiz-setup-playlist-tracks", activePlaylistId],
    queryFn: () => fetchPlaylistTracks(activePlaylistId),
    enabled: Boolean(activePlaylistId),
  });
  const { data: attemptsData } = useQuery({
    queryKey: ["quiz-attempts", activeQuizPlaylistId],
    queryFn: () => fetchQuizAttempts(activeQuizPlaylistId || ""),
    enabled: phase === "finished" && Boolean(activeQuizPlaylistId),
  });

  const currentTrack = quizTracks[currentIndex] ?? null;
  const snippetDurationSeconds = getSnippetDurationSeconds(difficulty);
  const timerAnnouncement = phase === "playing" || phase === "answering" ? getTimerAnnouncement(timeLeft) : "";

  const clearPreviewTimeout = useCallback(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      clearPreviewTimeout();
      stopQuizAudio();
      cancelPendingSnippetStart("Snippet playback cancelled.");
    };
  }, [clearTimers, clearPreviewTimeout, stopQuizAudio, cancelPendingSnippetStart]);

  useEffect(() => {
    // Stop main player when entering quiz mode to avoid overlapping playback.
    setPlaying(false);
  }, [setPlaying]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    return () => {
      searchAbortControllerRef.current?.abort();
      loadMoreAbortControllerRef.current?.abort();
    };
  }, []);

  const submitAnswer = useCallback(
    (value: string, track: Track, questionIndex: number) => {
      clearTimers();
      stopQuizAudio();

      const isCorrect = isQuizAnswerCorrect(value, track.title);

      if (isCorrect) {
        setScore((prev) => prev + 1);
      }

      setReviewEntries((prev) => {
        const next = [...prev];
        next[questionIndex] = {
          trackId: track.id,
          questionNumber: questionIndex + 1,
          correctAnswer: track.title,
          userAnswer: value.trim(),
          isCorrect,
        };
        return next;
      });
      setMultipleChoiceOptions([]);
      setToast({
        type: isCorrect ? "success" : "error",
        message: isCorrect ? "Correct answer! +1 point" : "Wrong answer.",
      });
      setLastResult(isCorrect);
      setFeedbackMessage(isCorrect ? "Benar!" : `Salah. Jawaban benar: ${track.title}`);
      setPhase("revealed");
    },
    [clearTimers, stopQuizAudio],
  );

  const runQuestion = useCallback(
    async (index: number, tracksPool: Track[]) => {
      const track = tracksPool[index];
      if (!track) {
        setPhase("finished");
        clearTimers();
        stopQuizAudio();
        return;
      }

      clearTimers();
      stopQuizAudio();
      setCurrentIndex(index);
      setAnswerInput("");
      setMultipleChoiceOptions([]);
      setLastResult(null);
      setFeedbackMessage(null);
      setErrorMessage(null);
      setPhase("playing");

      if (answerMode === "multiple_choice") {
        setMultipleChoiceOptions(buildMultipleChoiceOptions(track, tracksPool));
      }

      const snippetStart = pickSnippetStart(track.duration, snippetDurationSeconds);

      try {
        await playSnippet(track, snippetStart);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to play quiz snippet.");
        setPhase("setup");
        return;
      }

      preloadTrackMetadata(tracksPool[index + 1] ?? null);

      setTimeLeft(15);
      answerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            submitAnswer("", track, index);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      snippetTimeoutRef.current = setTimeout(() => {
        stopQuizAudio();
        setPhase((currentPhase) => (currentPhase === "playing" ? "answering" : currentPhase));
      }, snippetDurationSeconds * 1000);
    },
    [answerMode, answerIntervalRef, clearTimers, playSnippet, preloadTrackMetadata, snippetDurationSeconds, snippetTimeoutRef, stopQuizAudio, submitAnswer],
  );

  const createPlaylistMutation = useMutation({
    mutationFn: ({
      name,
      cover,
      difficulty,
      answerMode,
    }: {
      name: string;
      cover?: string;
      difficulty: QuizDifficulty;
      answerMode: QuizAnswerMode;
    }) => createQuizPlaylist(name, difficulty, answerMode, cover),
    onSuccess: async (playlist) => {
      setNewPlaylistName("");
      setNewPlaylistCover("");
      setSelectedPlaylistId(playlist.id);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create quiz playlist.");
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: ({ playlistId, isPublic }: { playlistId: string; isPublic: boolean }) =>
      setPlaylistPublic(playlistId, isPublic),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["public-quiz-playlists"] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update playlist visibility.");
    },
  });

  const saveQuizSettingsMutation = useMutation({
    mutationFn: ({ playlistId, difficulty, answerMode }: { playlistId: string; difficulty: QuizDifficulty; answerMode: QuizAnswerMode }) =>
      setQuizSettings(playlistId, difficulty, answerMode),
    onSuccess: async () => {
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["public-quiz-playlists"] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to set quiz settings.");
    },
  });

  const saveTrackMutation = useMutation({
    mutationFn: async ({ playlistId, track }: { playlistId: string; track: Track }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to save track");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["quiz-setup-playlist-tracks", activePlaylistId] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save track.");
    },
    onSettled: () => {
      setSavingTrackId(null);
    },
  });

  const removeTrackMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Failed to remove track");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["quiz-setup-playlist-tracks", activePlaylistId] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove track.");
    },
    onSettled: () => {
      setRemovingTrackId(null);
    },
  });

  const playPreviewSnippet = useCallback(
    async (track: Track) => {
      clearPreviewTimeout();
      stopQuizAudio();
      setPreviewingTrackId(track.id);

      try {
        await playSnippet(track, pickSnippetStart(track.duration, snippetDurationSeconds));
      } catch (error) {
        setPreviewingTrackId(null);
        setErrorMessage(error instanceof Error ? error.message : "Failed to preview track.");
        return;
      }

      previewTimeoutRef.current = setTimeout(() => {
        stopQuizAudio();
        setPreviewingTrackId(null);
      }, snippetDurationSeconds * 1000);
    },
    [clearPreviewTimeout, playSnippet, snippetDurationSeconds, stopQuizAudio],
  );

  const onSearchTracks = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    searchGenerationRef.current += 1;
    const requestGeneration = searchGenerationRef.current;
    searchAbortControllerRef.current?.abort();
    loadMoreAbortControllerRef.current?.abort();
    loadMoreAbortControllerRef.current = null;

    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
      setIsSearching(false);
      searchAbortControllerRef.current = null;
      loadMoreAbortControllerRef.current = null;
      return;
    }

    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        tracks?: Track[];
        message?: string;
        nextPageToken?: string | null;
        hasMore?: boolean;
      };

      if (requestGeneration !== searchGenerationRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.message || "Failed to search YouTube.");
      }

      setActiveSearchTerm(trimmed);
      setSearchResults(payload.tracks ?? []);
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (error) {
      if (controller.signal.aborted || requestGeneration !== searchGenerationRef.current) {
        return;
      }
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : "Failed to search YouTube.");
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
    } finally {
      if (requestGeneration === searchGenerationRef.current) {
        setIsSearching(false);
      }
      if (searchAbortControllerRef.current === controller) {
        searchAbortControllerRef.current = null;
      }
    }
  }, []);

  const loadMoreSearchResults = useCallback(async () => {
    if (!searchNextPageToken || !hasMoreSearchResults || isLoadingMoreSearch || isSearching) {
      return;
    }

    if (!activeSearchTerm) {
      return;
    }

    const requestGeneration = searchGenerationRef.current;
    const sourceTerm = activeSearchTerm;
    const sourcePageToken = searchNextPageToken;
    const controller = new AbortController();
    loadMoreAbortControllerRef.current?.abort();
    loadMoreAbortControllerRef.current = controller;
    setIsLoadingMoreSearch(true);

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(sourceTerm)}&pageToken=${encodeURIComponent(sourcePageToken)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const payload = (await response.json()) as {
        tracks?: Track[];
        message?: string;
        nextPageToken?: string | null;
        hasMore?: boolean;
      };

      if (controller.signal.aborted || requestGeneration !== searchGenerationRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.message || "Failed to load more tracks.");
      }

      setSearchResults((prev) => {
        const merged = [...prev, ...(payload.tracks ?? [])];
        const unique = new Map<string, Track>();
        for (const track of merged) {
          unique.set(track.id, track);
        }
        return [...unique.values()];
      });
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (error) {
      if (controller.signal.aborted || requestGeneration !== searchGenerationRef.current) {
        return;
      }
      setSearchError(error instanceof Error ? error.message : "Failed to load more tracks.");
    } finally {
      if (requestGeneration === searchGenerationRef.current) {
        setIsLoadingMoreSearch(false);
      }
      if (loadMoreAbortControllerRef.current === controller) {
        loadMoreAbortControllerRef.current = null;
      }
    }
  }, [activeSearchTerm, hasMoreSearchResults, isLoadingMoreSearch, isSearching, searchNextPageToken]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (phase !== "setup") {
      return;
    }
    void onSearchTracks(debouncedSearchQuery);
  }, [debouncedSearchQuery, onSearchTracks, phase]);

  const startQuiz = async (playlistIdOverride?: string) => {
    const targetPlaylistId = playlistIdOverride || activePlaylistId;
    if (!targetPlaylistId) {
      setErrorMessage("Please select a playlist first.");
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    clearPreviewTimeout();
    stopQuizAudio();
    setPreviewingTrackId(null);

    try {
      await setQuizSettings(targetPlaylistId, difficulty, answerMode);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["public-quiz-playlists"] }),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to set quiz settings.");
      return;
    }

    let payload: PlaylistDetailResponse;
    try {
      payload = await fetchPlaylistTracks(targetPlaylistId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load selected playlist.");
      return;
    }

    const tracks = payload.tracks ?? [];
    if (tracks.length < 1) {
      setErrorMessage("This playlist has no tracks for the quiz.");
      return;
    }
    if (answerMode === "multiple_choice" && tracks.length < 4) {
      setErrorMessage("Multiple choice mode requires at least 4 tracks in the playlist.");
      return;
    }

    const shuffled = shuffleTracks(tracks);

    setScore(0);
    setReviewEntries([]);
    setActiveQuizPlaylistId(targetPlaylistId);
    setActiveQuizSessionToken(payload.quizSessionToken ?? null);
    setQuizTracks(shuffled);
    await runQuestion(0, shuffled);
  };

  const nextQuestion = async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= quizTracks.length) {
      setIsFinishConfirmOpen(true);
      return;
    }

    await runQuestion(nextIndex, quizTracks);
  };

  const finishQuiz = async () => {
    if (isFinishingQuiz) {
      return;
    }

    setIsFinishingQuiz(true);
    setIsFinishConfirmOpen(false);

    if (activeQuizPlaylistId) {
      const answers: QuizAttemptAnswer[] = quizTracks.map((track, index) => ({
        trackId: track.id,
        userAnswer: reviewEntries[index]?.userAnswer?.trim() ?? "",
      }));
      try {
        if (!activeQuizSessionToken) {
          throw new Error("Quiz session invalid. Please restart quiz.");
        }
        await saveQuizAttempt({
          playlistId: activeQuizPlaylistId,
          difficulty,
          answerMode,
          quizSessionToken: activeQuizSessionToken,
          answers,
        });
      } catch (error) {
        if (isTokenExpiredError(error)) {
          try {
            const refreshed = await fetchPlaylistTracks(activeQuizPlaylistId);
            const refreshedToken = refreshed.quizSessionToken;
            if (!refreshedToken) {
              throw new Error("Quiz session expired. Please restart quiz.");
            }
            setActiveQuizSessionToken(refreshedToken);
            await saveQuizAttempt({
              playlistId: activeQuizPlaylistId,
              difficulty,
              answerMode,
              quizSessionToken: refreshedToken,
              answers,
            });
          } catch (retryError) {
            setErrorMessage(retryError instanceof Error ? retryError.message : "Failed to save quiz attempt.");
          }
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Failed to save quiz attempt.");
        }
      }
    }

    setPhase("finished");
    clearTimers();
    stopQuizAudio();
    setIsFinishingQuiz(false);
  };

  const cancelFinishQuiz = () => {
    if (isFinishingQuiz) {
      return;
    }
    setIsFinishConfirmOpen(false);
  };

  const restartQuiz = async () => {
    setIsFinishConfirmOpen(false);
    if (!quizTracks.length) {
      setPhase("setup");
      return;
    }
    if (answerMode === "multiple_choice" && quizTracks.length < 4) {
      setErrorMessage("Multiple choice mode requires at least 4 tracks in the playlist.");
      setPhase("setup");
      return;
    }

    const reshuffled = shuffleTracks(quizTracks);
    setQuizTracks(reshuffled);
    setScore(0);
    setReviewEntries([]);
    await runQuestion(0, reshuffled);
  };

  useEffect(() => {
    if (phase !== "setup") {
      clearPreviewTimeout();
      setPreviewingTrackId(null);
      searchAbortControllerRef.current?.abort();
      loadMoreAbortControllerRef.current?.abort();
      setIsSearching(false);
      setIsLoadingMoreSearch(false);
    }
  }, [clearPreviewTimeout, phase]);

  useEffect(() => {
    if (phase !== "setup") {
      return;
    }

    const sentinel = searchSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreSearchResults();
        }
      },
      { root: searchResultsContainerRef.current, rootMargin: "80px", threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreSearchResults, phase, searchResults.length]);

  const existingTrackIds = new Set((activePlaylistData?.tracks ?? []).map((track) => track.id));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Quiz Setup</p>

        {toast ? (
          <div
            aria-atomic="true"
            aria-live="polite"
            role="status"
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              toast.type === "success"
                ? "border-lime-300/45 bg-lime-300/10 text-lime-200"
                : "border-red-300/45 bg-red-300/10 text-red-200"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        {phase === "setup" ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
                onChange={(event) => {
                  setSelectedPlaylistId(event.target.value);
                  setDifficultyOverride(null);
                  setAnswerModeOverride(null);
                }}
                value={activePlaylistId}
              >
                <option className="text-black" value="">
                  Select playlist...
                </option>
                {playlists.map((playlist) => (
                  <option className="text-black" key={playlist.id} value={playlist.id}>
                    {playlist.name} ({playlist.trackCount}) {playlist.isQuiz ? "[Quiz]" : ""}{" "}
                    {playlist.isPublic ? "[Public]" : ""} [{getQuizDifficultyLabel(playlist.difficulty)} |{" "}
                    {getQuizAnswerModeLabel(coerceQuizAnswerMode(playlist.answerMode))}]
                  </option>
                ))}
              </select>

              <Input
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder="Create a new quiz playlist..."
                value={newPlaylistName}
              />

              <Button
                disabled={createPlaylistMutation.isPending}
                onClick={() => {
                  const name = newPlaylistName.trim();
                  if (!name) {
                    setErrorMessage("Quiz playlist name cannot be empty.");
                    return;
                  }
                  createPlaylistMutation.mutate({
                    name,
                    cover: newPlaylistCover.trim() || undefined,
                    difficulty,
                    answerMode,
                  });
                }}
                type="button"
                variant="ghost"
              >
                {createPlaylistMutation.isPending ? "Creating..." : "Create Quiz Playlist"}
              </Button>
            </div>

            <Input
              onChange={(event) => setNewPlaylistCover(event.target.value)}
              placeholder="Cover URL playlist quiz (optional)"
              value={newPlaylistCover}
            />

            {selectedPlaylist?.isQuiz ? (
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  checked={selectedPlaylist.isPublic}
                  className="h-4 w-4 accent-lime-400"
                  disabled={togglePublicMutation.isPending}
                  onChange={(event) => {
                    if (!activePlaylistId) {
                      return;
                    }
                    setErrorMessage(null);
                    togglePublicMutation.mutate({
                      playlistId: activePlaylistId,
                      isPublic: event.target.checked,
                    });
                  }}
                  type="checkbox"
                />
                Make this playlist public
              </label>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Difficulty</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    className={`rounded-md border px-3 py-2 text-sm transition ${
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

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Answer Mode</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUIZ_ANSWER_MODE_OPTIONS.map((option) => (
                  <button
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      answerMode === option.value
                        ? "border-lime-400/70 bg-lime-400/20 text-lime-100"
                        : "border-white/15 bg-white/5 text-white/80 hover:border-white/30"
                    }`}
                    key={option.value}
                    onClick={() => setAnswerModeOverride(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button disabled={!activePlaylistId || saveQuizSettingsMutation.isPending} onClick={() => {
                if (!activePlaylistId) {
                  setErrorMessage("Please select a playlist first.");
                  return;
                }
                setErrorMessage(null);
                saveQuizSettingsMutation.mutate({
                  playlistId: activePlaylistId,
                  difficulty,
                  answerMode,
                });
              }} type="button" variant="ghost">
                {saveQuizSettingsMutation.isPending ? "Saving..." : "Save Quiz Settings"}
              </Button>
              <Button disabled={isPlaylistsLoading} onClick={() => void startQuiz()} type="button">
                Start Quiz
              </Button>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
                Add Tracks to Quiz Playlist
              </p>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onSearchTracks(searchQuery);
                }}
              >
                <Input
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search YouTube tracks..."
                  value={searchQuery}
                />
                <Button disabled={isSearching} type="submit">
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </form>
              {searchError ? <p className="mt-2 text-sm text-red-300">{searchError}</p> : null}

              {searchResults.length ? (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1" ref={searchResultsContainerRef}>
                  {searchResults.map((track) => {
                    const alreadyAdded = existingTrackIds.has(track.id);
                    return (
                      <div
                        className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-white/10 px-3 py-2"
                        key={track.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{track.title}</p>
                          <p className="truncate text-xs text-white/65">{track.artist}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="h-8 px-3"
                            onClick={() => {
                              if (previewingTrackId === track.id) {
                                clearPreviewTimeout();
                                stopQuizAudio();
                                setPreviewingTrackId(null);
                                return;
                              }
                              setErrorMessage(null);
                              void playPreviewSnippet(track);
                            }}
                            type="button"
                            variant="ghost"
                          >
                            {previewingTrackId === track.id ? "Stop" : `Preview ${snippetDurationSeconds}s`}
                          </Button>
                          <Button
                            className="h-8 px-3"
                            disabled={!activePlaylistId || alreadyAdded || savingTrackId === track.id}
                            onClick={() => {
                              if (!activePlaylistId) {
                                setErrorMessage("Please select a quiz playlist first.");
                                return;
                              }
                              setSavingTrackId(track.id);
                              setErrorMessage(null);
                              saveTrackMutation.mutate({ playlistId: activePlaylistId, track });
                            }}
                            type="button"
                            variant="ghost"
                          >
                            {alreadyAdded ? "Added" : savingTrackId === track.id ? "Adding..." : "Add"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={searchSentinelRef} />
                  {isLoadingMoreSearch ? (
                    <p className="px-1 py-2 text-xs text-white/65">Loading more results...</p>
                  ) : null}
                  {!hasMoreSearchResults ? (
                    <p className="px-1 py-2 text-xs text-white/45">No more results.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {activePlaylistId ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
                  Current Quiz Playlist Tracks ({activePlaylistData?.tracks?.length ?? 0})
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(activePlaylistData?.tracks ?? []).map((track) => (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2" key={track.id}>
                      <Image
                        alt={track.title}
                        className="h-8 w-8 rounded object-cover"
                        height={32}
                        src={track.cover}
                        width={32}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{track.title}</p>
                        <p className="truncate text-xs text-white/65">{track.artist}</p>
                      </div>
                      <Button
                        className="ml-auto h-7 px-2 text-xs"
                        disabled={!activePlaylistId || removingTrackId === track.id}
                        onClick={() => {
                          if (!activePlaylistId) {
                            return;
                          }
                          setRemovingTrackId(track.id);
                          setErrorMessage(null);
                          removeTrackMutation.mutate({ playlistId: activePlaylistId, trackId: track.id });
                        }}
                        type="button"
                        variant="ghost"
                      >
                        {removingTrackId === track.id ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ))}
                  {!activePlaylistData?.tracks?.length ? (
                    <p className="text-xs text-white/65">No tracks in this playlist yet.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {phase !== "setup" && currentTrack ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-white/70">
              Question {currentIndex + 1}/{quizTracks.length} • Score: {score}
            </p>

            {phase === "playing" || phase === "answering" ? (
              <p className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                {phase === "playing"
                  ? `Playing ${snippetDurationSeconds}-second snippet... listen carefully.`
                  : "Snippet finished. Choose your answer."}
              </p>
            ) : null}

            {(phase === "playing" || phase === "answering") && answerMode === "typed" ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!currentTrack) {
                    return;
                  }
                  submitAnswer(answerInput, currentTrack, currentIndex);
                }}
              >
                <p className="text-sm text-lime-300">Time to answer: {timeLeft}s</p>
                {phase === "playing" ? (
                  <p className="text-xs text-white/65">Snippet is playing. You can answer now.</p>
                ) : null}
                <p aria-live="polite" className="sr-only" role="status">
                  {timerAnnouncement}
                </p>
                <div
                  aria-label="Answer time remaining"
                  aria-valuemax={15}
                  aria-valuemin={0}
                  aria-valuenow={timeLeft}
                  className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                >
                  <div
                    className="h-full bg-lime-400 transition-[width] duration-700"
                    style={{ width: `${Math.max(0, Math.min(100, (timeLeft / 15) * 100))}%` }}
                  />
                </div>
                <Input
                  onChange={(event) => setAnswerInput(event.target.value)}
                  placeholder="Guess the song title..."
                  value={answerInput}
                />
                <Button type="submit">Submit Answer</Button>
              </form>
            ) : null}

            {(phase === "playing" || phase === "answering") && answerMode === "multiple_choice" ? (
              <div className="space-y-2">
                <p className="text-sm text-lime-300">Time to answer: {timeLeft}s</p>
                <p className="min-h-5 text-xs text-white/65">
                  {phase === "playing"
                    ? "Snippet is playing. You can answer now."
                    : "Snippet finished. Answer now."}
                </p>
                <p aria-live="polite" className="sr-only" role="status">
                  {timerAnnouncement}
                </p>
                <div
                  aria-label="Answer time remaining"
                  aria-valuemax={15}
                  aria-valuemin={0}
                  aria-valuenow={timeLeft}
                  className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                >
                  <div
                    className="h-full bg-lime-400 transition-[width] duration-700"
                    style={{ width: `${Math.max(0, Math.min(100, (timeLeft / 15) * 100))}%` }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {multipleChoiceOptions.map((option, index) => (
                    <Button
                      className="justify-start rounded-lg px-3 py-2 text-left"
                      key={`${option}-${index}`}
                      onClick={() => {
                        if (!currentTrack) {
                          return;
                        }
                        submitAnswer(option, currentTrack, currentIndex);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      {index + 1}. {option}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === "revealed" ? (
              <div className="space-y-2">
                <p className={`text-sm ${lastResult ? "text-lime-300" : "text-amber-300"}`}>{feedbackMessage}</p>
                <Button onClick={() => void nextQuestion()} type="button" variant="ghost">
                  {currentIndex + 1 >= quizTracks.length ? "Finish Quiz" : "Next Question"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === "finished" ? (
          <div className="mt-3 space-y-2">
            <p className="text-lg font-semibold">Quiz finished</p>
            <p className="text-sm text-white/70">
              Final score: {score}/{quizTracks.length}
            </p>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">Leaderboard</p>
                <div className="mt-2 space-y-1 text-sm">
                  {(attemptsData?.leaderboard ?? []).length ? (
                    (attemptsData?.leaderboard ?? []).map((attempt, index) => (
                      <p className="text-white/80" key={`${attempt.userId}-${attempt.createdAt}`}>
                        #{index + 1} {attempt.userName || "Unknown"} • {attempt.score}/{attempt.totalQuestions} •{" "}
                        {getQuizDifficultyLabel(coerceQuizDifficulty(attempt.difficulty))}
                      </p>
                    ))
                  ) : (
                    <p className="text-white/50">No leaderboard data yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">Your History</p>
                <div className="mt-2 space-y-1 text-sm">
                  {(attemptsData?.userHistory ?? []).length ? (
                    (attemptsData?.userHistory ?? []).map((attempt) => (
                      <p className="text-white/80" key={attempt.id}>
                        {attempt.score}/{attempt.totalQuestions} •{" "}
                        {getQuizDifficultyLabel(coerceQuizDifficulty(attempt.difficulty))} •{" "}
                        {getQuizAnswerModeLabel(coerceQuizAnswerMode(attempt.answerMode))}
                      </p>
                    ))
                  ) : (
                    <p className="text-white/50">No previous attempts.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Review Answers</p>
              <div className="mt-2 space-y-2">
                {reviewEntries.filter(Boolean).length ? (
                  reviewEntries
                    .filter((entry): entry is QuestionReview => Boolean(entry))
                    .map((entry) => (
                      <div className="rounded-md border border-white/10 px-3 py-2" key={entry.questionNumber}>
                        <p className="text-sm text-white/80">Q{entry.questionNumber}</p>
                        <p className="text-sm text-white/65">Your answer: {entry.userAnswer || "Not answered"}</p>
                        <p className="text-sm text-white/65">Correct: {entry.correctAnswer}</p>
                        <p className={`text-sm ${entry.isCorrect ? "text-lime-300" : "text-amber-300"}`}>
                          {entry.isCorrect ? "Correct" : "Wrong"}
                        </p>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-white/50">No answers to review yet.</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void restartQuiz()} type="button" variant="ghost">
                Play Again
              </Button>
              <Button onClick={() => setPhase("setup")} type="button">
                Back to Setup
              </Button>
            </div>
          </div>
        ) : null}

        {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}
      </section>

      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={mainContainerRef} />
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={preloadContainerRef} />
      <ConfirmDialog
        cancelLabel="Continue Quiz"
        confirmLabel="Finish Quiz"
        description="You will finish this quiz and your score will be saved."
        isConfirming={isFinishingQuiz}
        onCancel={cancelFinishQuiz}
        onConfirm={() => void finishQuiz()}
        open={isFinishConfirmOpen}
        title="Finish quiz now?"
      />
    </div>
  );
}

