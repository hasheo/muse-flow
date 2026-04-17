"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { QuizGameplayScreen } from "@/components/quiz/quiz-gameplay-screen";
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
  type QuestionReview,
  type QuizAttemptAnswer,
} from "@/lib/quiz-types";
import { fetchPlaylistTracks, saveQuizAttempt, isTokenExpiredError, fetchQuizAttempts } from "@/lib/quiz-api";
import { shuffleTracks, buildMultipleChoiceOptions } from "@/lib/quiz-utils";

type QuizPhase = "ready" | "playing" | "answering" | "revealed" | "finished";

function computeStreak(reviewEntries: (QuestionReview | undefined)[], uptoIndex: number) {
  let streak = 0;
  for (let i = uptoIndex; i >= 0; i--) {
    if (reviewEntries[i]?.isCorrect) streak++;
    else break;
  }
  return streak;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      setLastResult(isCorrect);
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
        setErrorMessage("This playlist has no tracks for the quiz.");
        setPhase("finished");
        return;
      }
      if (answerMode === "multiple_choice" && tracks.length < 4) {
        setErrorMessage("Multiple choice mode requires at least 4 tracks in the playlist.");
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

  const streak =
    phase === "revealed"
      ? computeStreak(reviewEntries, currentIndex)
      : computeStreak(reviewEntries, currentIndex - 1);

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-2 sm:px-8">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition hover:text-white"
          href="/quiz"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lobby
        </Link>
        {phase !== "finished" && playlistData?.playlist?.name ? (
          <p className="truncate text-xs text-white/60 sm:text-sm">
            {playlistData.playlist.name}
            {playlistData.playlist.ownerName ? ` • ${playlistData.playlist.ownerName}` : ""}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : null}

      {phase === "ready" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-8">
          <div className="space-y-2 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-lime-300">
              Ready up
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              {playlistData?.playlist?.name ?? "Quiz"}
            </h1>
            <p className="text-sm text-white/60 sm:text-base">
              {playlistData?.tracks?.length ?? 0} tracks •{" "}
              {getQuizAnswerModeLabel(answerMode)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
              Choose difficulty
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                    difficulty === option.value
                      ? "border-lime-400/70 bg-lime-400/20 text-lime-100 shadow-lg shadow-lime-500/10"
                      : "border-white/15 bg-white/5 text-white/80 hover:border-white/30"
                  }`}
                  key={option.value}
                  onClick={() => setDifficultyOverride(option.value)}
                  type="button"
                >
                  <span className="block">{option.label}</span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    {option.snippetSeconds}s snippet
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Button
            className="h-14 rounded-2xl text-base font-black"
            onClick={() => void startQuizFromTracks(playlistData?.tracks ?? [])}
            type="button"
          >
            Start quiz
          </Button>
          {errorMessage ? <ErrorState compact message={errorMessage} /> : null}
        </div>
      ) : null}

      {phase !== "finished" && phase !== "ready" && currentTrack ? (
        <QuizGameplayScreen
          answerInput={answerInput}
          answerMode={answerMode}
          isLastQuestion={currentIndex + 1 >= quizTracks.length}
          lastResult={lastResult}
          multipleChoiceOptions={multipleChoiceOptions}
          onAnswerInputChange={setAnswerInput}
          onNext={() => void nextQuestion()}
          onSelectMultipleChoice={(option) => submitAnswer(option, currentTrack, currentIndex)}
          onSubmitTypedAnswer={() => submitAnswer(answerInput, currentTrack, currentIndex)}
          phase={phase}
          questionNumber={currentIndex + 1}
          revealTrack={phase === "revealed" ? currentTrack : null}
          score={score}
          snippetDurationSeconds={snippetDurationSeconds}
          streak={streak}
          timeLeft={timeLeft}
          totalQuestions={quizTracks.length}
        />
      ) : null}

      {phase === "finished" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-8">
          <div className="rounded-3xl border border-lime-300/20 bg-gradient-to-br from-lime-500/15 via-black/50 to-cyan-500/15 p-6 text-center sm:p-10">
            <Trophy className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
              Final score
            </p>
            <p className="mt-1 text-5xl font-black tracking-tight text-white sm:text-6xl">
              {score}
              <span className="text-2xl text-white/40 sm:text-3xl">/{quizTracks.length}</span>
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
                Leaderboard
              </p>
              <div className="mt-3 space-y-1 text-sm">
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
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
                Your history
              </p>
              <div className="mt-3 space-y-1 text-sm">
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

          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
              Review answers
            </p>
            <div className="mt-3 space-y-2">
              {reviewEntries.filter(Boolean).length ? (
                reviewEntries
                  .filter((entry): entry is QuestionReview => Boolean(entry))
                  .map((entry) => (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" key={entry.questionNumber}>
                      <p className="text-sm font-semibold text-white/80">Q{entry.questionNumber}</p>
                      <p className="text-sm text-white/65">
                        Your answer: {entry.userAnswer || "Not answered"}
                      </p>
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

          <div className="flex flex-wrap gap-2">
            <Button className="h-12 rounded-2xl px-6 font-bold" onClick={() => void restartQuiz()} type="button">
              Play again
            </Button>
            <Link href="/quiz">
              <Button className="h-12 rounded-2xl px-6 font-bold" type="button" variant="ghost">
                Back to lobby
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {errorMessage && phase !== "ready" ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-8">
          <ErrorState compact message={errorMessage} />
        </div>
      ) : null}

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
