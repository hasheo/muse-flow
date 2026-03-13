"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
import { Input } from "@/components/ui/input";
import { ManageTracksDialog } from "@/components/manage-tracks-dialog";
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
    body: JSON.stringify({ isQuiz: true, difficulty, answerMode }),
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isManageTracksOpen, setIsManageTracksOpen] = useState(false);
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
      setIsCreateDialogOpen(false);
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
          <div className="mt-3 space-y-4 sm:space-y-3">
            <div className="flex gap-2">
              <select
                className="h-10 min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
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
                  answerMode,
                });
              }}
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

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Answer Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {QUIZ_ANSWER_MODE_OPTIONS.map((option) => (
                  <button
                    className={`rounded-md border px-3 py-2.5 text-sm transition ${
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

            <div className="flex flex-col gap-2 sm:flex-row">
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
              <Button
                disabled={!activePlaylistId}
                onClick={() => setIsManageTracksOpen(true)}
                type="button"
                variant="ghost"
              >
                Manage Tracks ({activePlaylistData?.tracks?.length ?? 0})
              </Button>
              <Button disabled={isPlaylistsLoading} onClick={() => void startQuiz()} type="button">
                Start Quiz
              </Button>
            </div>

            <ManageTracksDialog
              open={isManageTracksOpen}
              playlistName={selectedPlaylist?.name ?? ""}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSearch={(query) => void onSearchTracks(query)}
              isSearching={isSearching}
              searchError={searchError}
              searchResults={searchResults}
              searchResultsContainerRef={searchResultsContainerRef}
              searchSentinelRef={searchSentinelRef}
              isLoadingMoreSearch={isLoadingMoreSearch}
              hasMoreSearchResults={hasMoreSearchResults}
              existingTrackIds={existingTrackIds}
              savingTrackId={savingTrackId}
              removingTrackId={removingTrackId}
              previewingTrackId={previewingTrackId}
              snippetDurationSeconds={snippetDurationSeconds}
              onPreview={(track) => {
                setErrorMessage(null);
                void playPreviewSnippet(track);
              }}
              onStopPreview={() => {
                clearPreviewTimeout();
                stopQuizAudio();
                setPreviewingTrackId(null);
              }}
              onAddTrack={(track) => {
                if (!activePlaylistId) {
                  setErrorMessage("Please select a quiz playlist first.");
                  return;
                }
                setSavingTrackId(track.id);
                setErrorMessage(null);
                saveTrackMutation.mutate({ playlistId: activePlaylistId, track });
              }}
              onRemoveTrack={(trackId) => {
                if (!activePlaylistId) return;
                setRemovingTrackId(trackId);
                setErrorMessage(null);
                removeTrackMutation.mutate({ playlistId: activePlaylistId, trackId });
              }}
              currentTracks={activePlaylistData?.tracks ?? []}
              onClose={() => setIsManageTracksOpen(false)}
            />
          </div>
        ) : null}

        {phase !== "setup" && currentTrack ? (
          <div className="mt-3 space-y-5">
            {/* Header: Question counter + circular timer */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-white/50">Question</p>
                <p className="text-2xl font-bold">
                  <span className="text-lime-400">{currentIndex + 1}</span>
                  <span className="text-white/40">/{quizTracks.length}</span>
                </p>
              </div>
              <p className="text-xs text-white/50">Score: {score}</p>
              {(phase === "playing" || phase === "answering") ? (
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <svg className="-rotate-90" height="64" width="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
                    <circle
                      cx="32" cy="32" r="28" fill="none" strokeWidth="4"
                      className={timeLeft <= 5 ? "text-red-400" : "text-lime-400"}
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - timeLeft / 15)}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.7s linear" }}
                    />
                  </svg>
                  <span className={`absolute text-sm font-bold ${timeLeft <= 5 ? "text-red-400" : "text-white"}`}>
                    {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
                  </span>
                  <p aria-live="polite" className="sr-only" role="status">{timerAnnouncement}</p>
                </div>
              ) : null}
            </div>

            {/* Question card */}
            {phase === "playing" || phase === "answering" ? (
              <div className="rounded-2xl bg-gradient-to-br from-lime-400/20 via-teal-400/10 to-transparent p-5">
                <p className="text-center text-base font-medium leading-relaxed sm:text-lg">
                  {phase === "playing"
                    ? `Listen to the ${snippetDurationSeconds}-second snippet...`
                    : "What song is this?"}
                </p>
              </div>
            ) : null}

            {/* Typed answer mode */}
            {(phase === "playing" || phase === "answering") && answerMode === "typed" ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!currentTrack) return;
                  submitAnswer(answerInput, currentTrack, currentIndex);
                }}
              >
                <Input
                  onChange={(event) => setAnswerInput(event.target.value)}
                  placeholder="Guess the song title..."
                  value={answerInput}
                />
                <button
                  className="w-full rounded-full bg-lime-400 py-3.5 text-sm font-semibold text-black transition hover:bg-lime-300 active:scale-[0.98]"
                  type="submit"
                >
                  Submit Answer
                </button>
              </form>
            ) : null}

            {/* Multiple choice mode */}
            {(phase === "playing" || phase === "answering") && answerMode === "multiple_choice" ? (
              <div className="space-y-2.5">
                {multipleChoiceOptions.map((option, index) => {
                  const label = String.fromCharCode(97 + index);
                  return (
                    <button
                      className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-left text-sm transition hover:border-lime-400/50 hover:bg-lime-400/10 active:scale-[0.98]"
                      key={`${option}-${index}`}
                      onClick={() => {
                        if (!currentTrack) return;
                        submitAnswer(option, currentTrack, currentIndex);
                      }}
                      type="button"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-xs font-semibold text-white/60">
                        {label}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Revealed phase */}
            {phase === "revealed" ? (
              <div className="space-y-4">
                <div className={`rounded-2xl p-5 text-center ${lastResult ? "bg-lime-400/15" : "bg-amber-400/15"}`}>
                  <p className={`text-lg font-semibold ${lastResult ? "text-lime-300" : "text-amber-300"}`}>
                    {lastResult ? "Correct!" : "Wrong!"}
                  </p>
                  <p className="mt-1 text-sm text-white/70">{feedbackMessage}</p>
                </div>
                <button
                  className="w-full rounded-full bg-lime-400 py-3.5 text-sm font-semibold text-black transition hover:bg-lime-300 active:scale-[0.98]"
                  onClick={() => void nextQuestion()}
                  type="button"
                >
                  {currentIndex + 1 >= quizTracks.length ? "Finish Quiz" : "Next"}
                </button>
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

