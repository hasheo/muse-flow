"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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
  DEFAULT_QUIZ_ANSWER_MODE,
  getQuizAnswerModeLabel,
  type QuizAnswerMode,
} from "@/lib/quiz-answer-mode";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { usePlayerStore } from "@/store/player-store";
import { isQuizAnswerCorrect, normalizeQuizText } from "@/lib/quiz-text";

type PlaylistDetailResponse = {
  playlist?: {
    id: string;
    name: string;
    cover: string;
    isQuiz: boolean;
    isPublic: boolean;
    difficulty: QuizDifficulty;
    answerMode: QuizAnswerMode;
    ownerName?: string;
    trackCount: number;
  };
  tracks?: Track[];
  quizSessionToken?: string | null;
  message?: string;
};

type QuizPhase = "ready" | "playing" | "answering" | "revealed" | "finished";
type QuizToast = { message: string; type: "error" | "success" } | null;
type QuestionReview = {
  trackId: string;
  questionNumber: number;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
};
type QuizAttemptAnswer = {
  trackId: string;
  userAnswer: string;
};

type QuizAttemptItem = {
  id: string;
  userId: string;
  userName?: string;
  score: number;
  totalQuestions: number;
  difficulty: string;
  answerMode: string;
  createdAt: string;
};
type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: {
    reason?: string;
  };
};

class QuizAttemptSaveError extends Error {
  code?: string;
  reason?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message || "Failed to save quiz attempt.");
    this.name = "QuizAttemptSaveError";
    this.code = payload.code;
    this.reason = payload.details?.reason;
  }
}

function shuffleItems<T>(list: T[]) {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function shuffleTracks(list: Track[]) {
  return shuffleItems(list);
}

function buildMultipleChoiceOptions(track: Track, tracksPool: Track[]) {
  const normalizedCorrect = normalizeQuizText(track.title);
  const choices: string[] = [track.title];
  const used = new Set<string>([normalizedCorrect]);
  const distractors = shuffleItems(
    tracksPool.filter((candidate) => normalizeQuizText(candidate.title) !== normalizedCorrect),
  );

  for (const candidate of distractors) {
    if (choices.length >= 4) {
      break;
    }
    const normalizedCandidate = normalizeQuizText(candidate.title);
    if (used.has(normalizedCandidate)) {
      continue;
    }
    used.add(normalizedCandidate);
    choices.push(candidate.title);
  }

  while (choices.length < 4) {
    choices.push(`Pilihan lain ${choices.length}`);
  }

  return shuffleItems(choices);
}

function getTimerAnnouncement(secondsLeft: number) {
  if (secondsLeft === 10) {
    return "10 detik tersisa.";
  }
  if (secondsLeft <= 5 && secondsLeft >= 1) {
    return `${secondsLeft} detik tersisa.`;
  }
  if (secondsLeft === 0) {
    return "Waktu habis.";
  }
  return "";
}

async function fetchPlaylistTracks(playlistId: string) {
  const response = await fetch(`/api/playlists/${playlistId}`, { cache: "no-store" });
  const payload = (await response.json()) as PlaylistDetailResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Failed to load playlist tracks");
  }

  return payload;
}

async function saveQuizAttempt(payload: {
  playlistId: string;
  difficulty: QuizDifficulty;
  answerMode: QuizAnswerMode;
  quizSessionToken: string;
  answers: QuizAttemptAnswer[];
}) {
  const response = await fetch("/api/quiz/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = (await response.json()) as ApiErrorPayload;
  if (!response.ok) {
    throw new QuizAttemptSaveError(parsed);
  }
}

function isTokenExpiredError(error: unknown) {
  return error instanceof QuizAttemptSaveError && error.code === "UNAUTHORIZED" && error.reason === "Token expired";
}

async function fetchQuizAttempts(playlistId: string) {
  const response = await fetch(`/api/quiz/attempts?playlistId=${encodeURIComponent(playlistId)}`, {
    cache: "no-store",
  });
  const parsed = (await response.json()) as {
    leaderboard?: QuizAttemptItem[];
    userHistory?: QuizAttemptItem[];
    message?: string;
  };
  if (!response.ok) {
    throw new Error(parsed.message || "Failed to load quiz attempts.");
  }
  return {
    leaderboard: parsed.leaderboard ?? [],
    userHistory: parsed.userHistory ?? [],
  };
}

export function QuizPlayView({ playlistId }: { playlistId: string }) {
  const queryClient = useQueryClient();
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const [phase, setPhase] = useState<QuizPhase>("ready");
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
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [reviewEntries, setReviewEntries] = useState<QuestionReview[]>([]);
  const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState(false);
  const [isFinishingQuiz, setIsFinishingQuiz] = useState(false);

  const pendingSnippetStartRef = useRef<{
    reject: (error: Error) => void;
    resolve: () => void;
  } | null>(null);
  const snippetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadedTrackIdRef = useRef<string | null>(null);

  const { data: playlistData, isLoading } = useQuery({
    queryKey: ["quiz-playlist-tracks", playlistId],
    queryFn: () => fetchPlaylistTracks(playlistId),
  });
  const { data: attemptsData } = useQuery({
    queryKey: ["quiz-attempts", playlistId],
    queryFn: () => fetchQuizAttempts(playlistId),
    enabled: phase === "finished",
  });

  const currentTrack = quizTracks[currentIndex] ?? null;
  const playlistDifficulty = playlistData?.playlist?.difficulty ?? DEFAULT_QUIZ_DIFFICULTY;
  const playlistAnswerMode = playlistData?.playlist?.answerMode ?? DEFAULT_QUIZ_ANSWER_MODE;
  const quizSessionToken = playlistData?.quizSessionToken ?? null;
  const difficulty = difficultyOverride ?? playlistDifficulty;
  const answerMode = playlistAnswerMode;
  const snippetDurationSeconds = getSnippetDurationSeconds(difficulty);
  const timerAnnouncement = phase === "playing" || phase === "answering" ? getTimerAnnouncement(timeLeft) : "";

  const clearTimers = useCallback(() => {
    if (snippetTimeoutRef.current) {
      clearTimeout(snippetTimeoutRef.current);
      snippetTimeoutRef.current = null;
    }
    if (answerIntervalRef.current) {
      clearInterval(answerIntervalRef.current);
      answerIntervalRef.current = null;
    }
  }, []);

  const cancelPendingSnippetStart = useCallback((message: string) => {
    pendingSnippetStartRef.current?.reject(new Error(message));
    pendingSnippetStartRef.current = null;
  }, []);

  const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };

  const { playerRef: mainPlayerRef, containerRef: mainContainerRef } = useYouTubePlayer({
    playerVars: QUIZ_PLAYER_VARS,
    onStateChange: (event) => {
      if (event.data === 1) {
        pendingSnippetStartRef.current?.resolve();
        pendingSnippetStartRef.current = null;
      }
    },
    onError: () => {
      cancelPendingSnippetStart("Failed to start snippet playback.");
    },
  });
  const { playerRef: preloadPlayerRef, readyRef: preloadReadyRef, containerRef: preloadContainerRef } = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });

  const stopQuizAudio = useCallback(() => {
    mainPlayerRef.current?.pauseVideo();
  }, [mainPlayerRef]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopQuizAudio();
      cancelPendingSnippetStart("Snippet playback cancelled.");
    };
  }, [clearTimers, stopQuizAudio, cancelPendingSnippetStart]);

  useEffect(() => {
    setPlaying(false);
  }, [setPlaying]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const waitForYouTubePlayerInstance = useCallback((timeoutMs = 20000) => {
    return new Promise<void>((resolve, reject) => {
      if (mainPlayerRef.current) {
        resolve();
        return;
      }

      const start = Date.now();
      const intervalId = window.setInterval(() => {
        if (mainPlayerRef.current) {
          window.clearInterval(intervalId);
          resolve();
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          window.clearInterval(intervalId);
          reject(new Error("YouTube player is not ready yet."));
        }
      }, 50);
    });
  }, [mainPlayerRef]);

  const playSnippet = useCallback(async (track: Track, startAt: number) => {
    await waitForYouTubePlayerInstance();
    let lastError: unknown;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const player = mainPlayerRef.current;
      if (!player) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
        continue;
      }

      try {
        cancelPendingSnippetStart("Restarting snippet playback.");
        const playbackStarted = new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            if (pendingSnippetStartRef.current === marker) {
              pendingSnippetStartRef.current = null;
            }
            reject(new Error("Snippet took too long to start."));
          }, 8000);

          const marker = {
            reject: (error: Error) => {
              window.clearTimeout(timeoutId);
              if (pendingSnippetStartRef.current === marker) {
                pendingSnippetStartRef.current = null;
              }
              reject(error);
            },
            resolve: () => {
              window.clearTimeout(timeoutId);
              if (pendingSnippetStartRef.current === marker) {
                pendingSnippetStartRef.current = null;
              }
              resolve();
            },
          };

          pendingSnippetStartRef.current = marker;
        });

        player.loadVideoById(track.youtubeVideoId, startAt);
        await playbackStarted;
        return;
      } catch (error) {
        lastError = error;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
      }
    }

    if (lastError instanceof Error) {
      throw new Error(lastError.message);
    }
    throw new Error("YouTube player is not ready yet.");
  }, [cancelPendingSnippetStart, mainPlayerRef, waitForYouTubePlayerInstance]);

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
        message: isCorrect ? "Jawaban benar! +1 poin" : "Jawaban salah.",
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
        setPhase("finished");
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
    [answerMode, clearTimers, playSnippet, preloadTrackMetadata, snippetDurationSeconds, stopQuizAudio, submitAnswer],
  );

  const startQuizFromTracks = useCallback(
    async (tracks: Track[]) => {
      if (!tracks.length) {
        setErrorMessage("Playlist tidak punya lagu untuk quiz.");
        setPhase("finished");
        return;
      }
      if (answerMode === "multiple_choice" && tracks.length < 4) {
        setErrorMessage("Mode pilihan ganda butuh minimal 4 lagu di playlist.");
        setPhase("ready");
        return;
      }

      const shuffled = shuffleTracks(tracks);
      setScore(0);
      setReviewEntries([]);
      setQuizTracks(shuffled);
      await runQuestion(0, shuffled);
    },
    [answerMode, runQuestion],
  );

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

    const answers: QuizAttemptAnswer[] = quizTracks.map((track, index) => ({
      trackId: track.id,
      userAnswer: reviewEntries[index]?.userAnswer?.trim() ?? "",
    }));

    try {
      if (!quizSessionToken) {
        throw new Error("Quiz session invalid. Please restart quiz.");
      }
      await saveQuizAttempt({
        playlistId,
        difficulty,
        answerMode,
        quizSessionToken,
        answers,
      });
    } catch (error) {
      if (isTokenExpiredError(error)) {
        try {
          const refreshed = await fetchPlaylistTracks(playlistId);
          const refreshedToken = refreshed.quizSessionToken;
          if (!refreshedToken) {
            throw new Error("Quiz session expired. Please restart quiz.");
          }
          queryClient.setQueryData<PlaylistDetailResponse>(["quiz-playlist-tracks", playlistId], (previous) => {
            if (!previous) {
              return refreshed;
            }
            return {
              ...previous,
              quizSessionToken: refreshedToken,
            };
          });
          await saveQuizAttempt({
            playlistId,
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
    const sourceTracks = playlistData?.tracks ?? [];
    if (!sourceTracks.length) {
      return;
    }
    await startQuizFromTracks(sourceTracks);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
      {isLoading ? <p className="mb-3 text-sm text-white/70">Menyiapkan quiz...</p> : null}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-white/70">
            {playlistData?.playlist?.name} {playlistData?.playlist?.ownerName ? `• by ${playlistData.playlist.ownerName}` : ""}
          </p>
        </div>
        <Link className="text-xs text-lime-300 hover:underline" href="/quiz">
          Back to Public Quiz
        </Link>
      </div>

      {toast ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          role="status"
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-lime-300/45 bg-lime-300/10 text-lime-200"
              : "border-red-300/45 bg-red-300/10 text-red-200"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {phase === "ready" ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70">
            Playlist ini berisi {playlistData?.tracks?.length ?? 0} lagu.
          </p>
          <p className="text-xs text-white/55">
            Difficulty playlist: {getQuizDifficultyLabel(playlistData?.playlist?.difficulty ?? DEFAULT_QUIZ_DIFFICULTY)}
          </p>
          <p className="text-xs text-white/55">
            Mode jawaban playlist: {getQuizAnswerModeLabel(answerMode)}
          </p>
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
          <Button
            onClick={() => void startQuizFromTracks(playlistData?.tracks ?? [])}
            type="button"
          >
            Start Quiz
          </Button>
        </div>
      ) : null}

      {phase !== "finished" && phase !== "ready" && currentTrack ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70">
            Question {currentIndex + 1}/{quizTracks.length} • Score: {score}
          </p>

          {phase === "playing" || phase === "answering" ? (
            <p className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              {phase === "playing"
                ? `Playing ${snippetDurationSeconds}-second snippet... dengarkan baik-baik.`
                : "Snippet selesai. Pilih jawaban."}
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
              <p className="text-sm text-lime-300">Waktu menjawab: {timeLeft} detik</p>
              {phase === "playing" ? (
                <p className="text-xs text-white/65">Snippet sedang diputar. Kamu bisa jawab sekarang.</p>
              ) : null}
              <p aria-live="polite" className="sr-only" role="status">
                {timerAnnouncement}
              </p>
              <div
                aria-label="Sisa waktu menjawab"
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
                placeholder="Tebak judul lagunya..."
                value={answerInput}
              />
              <Button type="submit">Submit Answer</Button>
            </form>
          ) : null}

          {(phase === "playing" || phase === "answering") && answerMode === "multiple_choice" ? (
            <div className="space-y-2">
              <p className="text-sm text-lime-300">Waktu menjawab: {timeLeft} detik</p>
              <p className="min-h-5 text-xs text-white/65">
                {phase === "playing"
                  ? "Snippet sedang diputar. Kamu bisa jawab sekarang."
                  : "Snippet selesai. Jawab sekarang."}
              </p>
              <p aria-live="polite" className="sr-only" role="status">
                {timerAnnouncement}
              </p>
              <div
                aria-label="Sisa waktu menjawab"
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
        <div className="space-y-2">
          <p className="text-lg font-semibold">Quiz selesai</p>
          <p className="text-sm text-white/70">
            Skor akhir: {score}/{quizTracks.length}
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
                  <p className="text-white/50">Belum ada data leaderboard.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Riwayat Kamu</p>
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
                  <p className="text-white/50">Belum ada attempt sebelumnya.</p>
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
                      <p className="text-sm text-white/65">Jawabanmu: {entry.userAnswer || "Tidak dijawab"}</p>
                      <p className="text-sm text-white/65">Benar: {entry.correctAnswer}</p>
                      <p className={`text-sm ${entry.isCorrect ? "text-lime-300" : "text-amber-300"}`}>
                        {entry.isCorrect ? "Correct" : "Wrong"}
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-white/50">Belum ada jawaban untuk direview.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void restartQuiz()} type="button" variant="ghost">
              Play Again
            </Button>
            <Link href="/quiz">
              <Button type="button">Back to Public Quiz</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={mainContainerRef} />
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={preloadContainerRef} />
      <ConfirmDialog
        cancelLabel="Lanjut Quiz"
        confirmLabel="Finish Quiz"
        description="Kamu akan menyelesaikan quiz ini dan skor akan disimpan."
        isConfirming={isFinishingQuiz}
        onCancel={cancelFinishQuiz}
        onConfirm={() => void finishQuiz()}
        open={isFinishConfirmOpen}
        title="Selesaikan quiz sekarang?"
      />
    </section>
  );
}
