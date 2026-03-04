"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
} from "@/lib/quiz-answer-mode";
import { useQuizTimers } from "@/hooks/use-quiz-timers";
import { useQuizPlayers } from "@/hooks/use-quiz-players";
import { useQuizSnippetPlayback } from "@/hooks/use-quiz-snippet-playback";
import { usePlayerStore } from "@/store/player-store";
import { isQuizAnswerCorrect } from "@/lib/quiz-text";
import {
  type PlaylistDetailResponse,
  type QuizToast,
  type QuestionReview,
  type QuizAttemptAnswer,
} from "@/lib/quiz-types";
import { fetchPlaylistTracks, saveQuizAttempt, isTokenExpiredError, fetchQuizAttempts } from "@/lib/quiz-api";
import { shuffleTracks, buildMultipleChoiceOptions, getTimerAnnouncement } from "@/lib/quiz-utils";

type QuizPhase = "ready" | "playing" | "answering" | "revealed" | "finished";

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

  const { clearTimers, cancelPendingSnippetStart, pendingSnippetStartRef, snippetTimeoutRef, answerIntervalRef } = useQuizTimers();
  const { mainPlayerRef, mainContainerRef, preloadPlayerRef, preloadReadyRef, preloadContainerRef, stopQuizAudio } = useQuizPlayers({ pendingSnippetStartRef, cancelPendingSnippetStart });
  const { playSnippet, preloadTrackMetadata } = useQuizSnippetPlayback({ mainPlayerRef, preloadPlayerRef, preloadReadyRef, pendingSnippetStartRef, cancelPendingSnippetStart });

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
    [answerIntervalRef, answerMode, clearTimers, playSnippet, preloadTrackMetadata, snippetDurationSeconds, snippetTimeoutRef, stopQuizAudio, submitAnswer],
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
