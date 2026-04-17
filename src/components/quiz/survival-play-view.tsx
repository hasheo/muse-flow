"use client";

import Link from "next/link";
import { ArrowLeft, Database, Flame, Heart, Skull, Trophy } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { QuizGameplayScreen } from "@/components/quiz/quiz-gameplay-screen";
import { useQuizTimers } from "@/hooks/use-quiz-timers";
import { useQuizPlayers } from "@/hooks/use-quiz-players";
import { useQuizSnippetPlayback } from "@/hooks/use-quiz-snippet-playback";
import type { Track } from "@/lib/catalog";
import {
  coerceQuizAnswerMode,
  DEFAULT_QUIZ_ANSWER_MODE,
  QUIZ_ANSWER_MODE_OPTIONS,
  type QuizAnswerMode,
} from "@/lib/quiz-answer-mode";
import {
  DEFAULT_QUIZ_DIFFICULTY,
  QUIZ_DIFFICULTY_OPTIONS,
  type QuizDifficulty,
} from "@/lib/quiz-difficulty";
import { usePlayerStore } from "@/store/player-store";

type Phase = "setup" | "playing" | "answering" | "revealed" | "finished";

type SurvivalQuestion = {
  id: string;
  youtubeVideoId: string;
  duration: number;
  snippetStart: number;
  snippetSeconds: number;
  options?: string[];
};

type RevealTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  youtubeVideoId: string;
};

type StartResponse = {
  token: string;
  score: number;
  strikes: number;
  strikesAllowed: number;
  question: SurvivalQuestion;
};

type NextResponse = {
  correct?: boolean;
  skipped?: boolean;
  reveal?: RevealTrack;
  score: number;
  strikes: number;
  strikesAllowed: number;
  gameOver: boolean;
  exhausted?: boolean;
  token?: string;
  question?: SurvivalQuestion;
};

function questionToPlaybackTrack(question: SurvivalQuestion): Track {
  return {
    id: question.id,
    title: "",
    artist: "",
    album: "",
    duration: question.duration,
    cover: "",
    sourceType: "youtube",
    youtubeVideoId: question.youtubeVideoId,
  };
}

export function SurvivalPlayView() {
  const { data: session } = useSession();
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const [phase, setPhase] = useState<Phase>("setup");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(DEFAULT_QUIZ_DIFFICULTY);
  const [answerMode, setAnswerMode] = useState<QuizAnswerMode>(DEFAULT_QUIZ_ANSWER_MODE);
  const [catalogEmpty, setCatalogEmpty] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [question, setQuestion] = useState<SurvivalQuestion | null>(null);
  const [pendingNextQuestion, setPendingNextQuestion] = useState<SurvivalQuestion | null>(null);
  const [pendingNextToken, setPendingNextToken] = useState<string | null>(null);

  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [strikesAllowed, setStrikesAllowed] = useState(3);

  const [answerInput, setAnswerInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(15);
  const [lastResult, setLastResult] = useState<null | boolean>(null);
  const [revealTrack, setRevealTrack] = useState<RevealTrack | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);

  const submitInFlightRef = useRef(false);

  const { clearTimers, cancelPendingSnippetStart, pendingSnippetStartRef, snippetTimeoutRef, answerIntervalRef } =
    useQuizTimers();
  const { mainPlayerRef, mainContainerRef, preloadPlayerRef, preloadReadyRef, preloadContainerRef, stopQuizAudio } =
    useQuizPlayers({ pendingSnippetStartRef, cancelPendingSnippetStart });
  const { playSnippet } = useQuizSnippetPlayback({
    mainPlayerRef,
    preloadPlayerRef,
    preloadReadyRef,
    pendingSnippetStartRef,
    cancelPendingSnippetStart,
  });

  useEffect(() => {
    setPlaying(false);
  }, [setPlaying]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopQuizAudio();
      cancelPendingSnippetStart("Snippet playback cancelled.");
    };
  }, [clearTimers, stopQuizAudio, cancelPendingSnippetStart]);

  useEffect(() => {
    let cancelled = false;
    async function loadBest() {
      try {
        const response = await fetch("/api/quiz/survival/attempts", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { best?: number };
        if (!cancelled && typeof payload.best === "number") {
          setBestScore(payload.best);
        }
      } catch {
        // best-effort; silent
      }
    }
    void loadBest();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const runQuestion = useCallback(
    async (nextQuestion: SurvivalQuestion) => {
      clearTimers();
      stopQuizAudio();
      setAnswerInput("");
      setLastResult(null);
      setPhase("playing");

      const track = questionToPlaybackTrack(nextQuestion);
      try {
        await playSnippet(track, nextQuestion.snippetStart);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to play snippet.");
        setPhase("finished");
        return;
      }

      setTimeLeft(15);
      answerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            void submitAnswer({ value: "", timedOut: true });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      snippetTimeoutRef.current = setTimeout(() => {
        stopQuizAudio();
        setPhase((currentPhase) => (currentPhase === "playing" ? "answering" : currentPhase));
      }, nextQuestion.snippetSeconds * 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answerIntervalRef, clearTimers, playSnippet, snippetTimeoutRef, stopQuizAudio],
  );

  const startSurvival = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setErrorMessage(null);
    setExhausted(false);
    setCatalogEmpty(false);
    try {
      const response = await fetch("/api/quiz/survival/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, answerMode }),
      });
      const payload = (await response.json()) as Partial<StartResponse> & {
        message?: string;
        code?: string;
      };
      if (response.status === 409 && payload.code === "EMPTY_CATALOG") {
        setCatalogEmpty(true);
        return;
      }
      if (!response.ok || !payload.token || !payload.question) {
        throw new Error(payload.message || "Failed to start survival run");
      }
      setToken(payload.token);
      setQuestion(payload.question);
      setScore(payload.score ?? 0);
      setStrikes(payload.strikes ?? 0);
      setStrikesAllowed(payload.strikesAllowed ?? 3);
      setRevealTrack(null);
      setPendingNextQuestion(null);
      setPendingNextToken(null);
      await runQuestion(payload.question);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start survival run");
      setPhase("setup");
    } finally {
      setIsStarting(false);
    }
  }, [answerMode, difficulty, isStarting, runQuestion]);

  const submitAnswer = useCallback(
    async ({ value, timedOut }: { value: string; timedOut?: boolean }) => {
      if (submitInFlightRef.current) return;
      if (!token) return;
      submitInFlightRef.current = true;
      setIsSubmitting(true);
      clearTimers();
      stopQuizAudio();

      try {
        const response = await fetch("/api/quiz/survival/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, answer: value, timedOut: Boolean(timedOut) }),
        });
        const payload = (await response.json()) as Partial<NextResponse> & { message?: string };
        if (!response.ok) {
          throw new Error(payload.message || "Failed to submit answer");
        }

        setScore(payload.score ?? 0);
        setStrikes(payload.strikes ?? 0);
        setStrikesAllowed(payload.strikesAllowed ?? strikesAllowed);

        // Pending track was removed mid-game — skip ahead to the new question
        // without a reveal phase or score/strike change.
        if (payload.skipped) {
          if (payload.gameOver) {
            setExhausted(Boolean(payload.exhausted));
            setPhase("finished");
            return;
          }
          if (payload.token && payload.question) {
            setToken(payload.token);
            setQuestion(payload.question);
            setRevealTrack(null);
            setPendingNextQuestion(null);
            setPendingNextToken(null);
            await runQuestion(payload.question);
          }
          return;
        }

        if (!payload.reveal) {
          throw new Error("Missing reveal in response");
        }

        setRevealTrack(payload.reveal);
        setLastResult(Boolean(payload.correct));

        if (payload.gameOver) {
          setExhausted(Boolean(payload.exhausted));
          setPendingNextQuestion(null);
          setPendingNextToken(null);
          setPhase("revealed");
          return;
        }

        setPendingNextQuestion(payload.question ?? null);
        setPendingNextToken(payload.token ?? null);
        setPhase("revealed");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to submit answer");
        setPhase("finished");
      } finally {
        setIsSubmitting(false);
        submitInFlightRef.current = false;
      }
    },
    [clearTimers, runQuestion, stopQuizAudio, strikesAllowed, token],
  );

  const handleNext = useCallback(async () => {
    if (!pendingNextQuestion || !pendingNextToken) {
      // game over → jump to finished screen
      setPhase("finished");
      clearTimers();
      stopQuizAudio();
      return;
    }
    setToken(pendingNextToken);
    setQuestion(pendingNextQuestion);
    setRevealTrack(null);
    setPendingNextQuestion(null);
    setPendingNextToken(null);
    await runQuestion(pendingNextQuestion);
  }, [clearTimers, pendingNextQuestion, pendingNextToken, runQuestion, stopQuizAudio]);

  const resetToSetup = () => {
    clearTimers();
    stopQuizAudio();
    setPhase("setup");
    setToken(null);
    setQuestion(null);
    setRevealTrack(null);
    setPendingNextQuestion(null);
    setPendingNextToken(null);
    setScore(0);
    setStrikes(0);
    setLastResult(null);
    setErrorMessage(null);
    setExhausted(false);
  };

  const gameplayReady = phase === "playing" || phase === "answering" || phase === "revealed";

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
        <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-200">
          Survival
        </span>
      </div>

      {phase === "setup" && catalogEmpty ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-8">
          <div className="rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-500/15 via-black/40 to-rose-500/10 p-8 text-center sm:p-10">
            <Database className="mx-auto h-10 w-10 text-amber-200" />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-200">
              Catalog is empty
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Survival mode isn&apos;t available yet
            </h2>
            <p className="mt-2 text-sm text-white/60 sm:text-base">
              The survival catalog needs to be seeded with tracks before anyone can play.
              Once an admin adds some, you&apos;ll be able to start a run.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link href="/quiz">
                <Button className="h-11 rounded-2xl px-5 font-bold" type="button" variant="ghost">
                  Back to lobby
                </Button>
              </Link>
              {session?.user?.isAdmin ? (
                <Link href="/admin/catalog">
                  <Button className="h-11 rounded-2xl px-5 font-bold" type="button">
                    Open admin catalog
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {phase === "setup" && !catalogEmpty ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-8">
          <div className="space-y-2 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-rose-300">
              Three strikes and you&apos;re out
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
              Survival
            </h1>
            <p className="text-sm text-white/60 sm:text-base">
              Tracks come from the curated catalog. Miss three and your run ends — how long can you last?
            </p>
            {bestScore !== null && bestScore > 0 ? (
              <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
                <Flame className="h-3.5 w-3.5" />
                Personal best: {bestScore}
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
              Difficulty
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
                  onClick={() => setDifficulty(option.value)}
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

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
              Answer mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUIZ_ANSWER_MODE_OPTIONS.map((option) => (
                <button
                  className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                    answerMode === option.value
                      ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100 shadow-lg shadow-cyan-500/10"
                      : "border-white/15 bg-white/5 text-white/80 hover:border-white/30"
                  }`}
                  key={option.value}
                  onClick={() => setAnswerMode(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="h-14 rounded-2xl text-base font-black"
            disabled={isStarting}
            onClick={() => void startSurvival()}
            type="button"
          >
            {isStarting ? "Starting..." : "Start survival run"}
          </Button>
          {errorMessage ? <ErrorState compact message={errorMessage} /> : null}
        </div>
      ) : null}

      {gameplayReady && question ? (
        <QuizGameplayScreen
          answerInput={answerInput}
          answerMode={coerceQuizAnswerMode(answerMode)}
          isLastQuestion={false}
          lastResult={lastResult}
          multipleChoiceOptions={question.options ?? []}
          onAnswerInputChange={setAnswerInput}
          onNext={() => {
            if (!pendingNextQuestion || !pendingNextToken) {
              // Game over on this reveal — finish
              setPhase("finished");
              clearTimers();
              stopQuizAudio();
              return;
            }
            void handleNext();
          }}
          onSelectMultipleChoice={(option) => {
            if (phase !== "playing" && phase !== "answering") return;
            if (isSubmitting) return;
            void submitAnswer({ value: option });
          }}
          onSubmitTypedAnswer={() => {
            if (phase !== "playing" && phase !== "answering") return;
            if (isSubmitting) return;
            void submitAnswer({ value: answerInput });
          }}
          phase={phase}
          questionNumber={score + strikes + 1}
          revealTrack={
            phase === "revealed" && revealTrack
              ? {
                  id: revealTrack.id,
                  title: revealTrack.title,
                  artist: revealTrack.artist,
                  album: revealTrack.album,
                  duration: 0,
                  cover: revealTrack.cover,
                  sourceType: "youtube",
                  youtubeVideoId: revealTrack.youtubeVideoId,
                }
              : null
          }
          score={score}
          snippetDurationSeconds={question.snippetSeconds}
          streak={score}
          survivalStats={{ strikes, strikesAllowed }}
          timeLeft={timeLeft}
          totalQuestions={0}
        />
      ) : null}

      {phase === "finished" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-8">
          <div className="rounded-3xl border border-rose-300/30 bg-gradient-to-br from-rose-500/20 via-black/50 to-amber-500/15 p-6 text-center sm:p-10">
            {exhausted ? (
              <Trophy className="mx-auto h-10 w-10 text-amber-300" />
            ) : (
              <Skull className="mx-auto h-10 w-10 text-rose-300" />
            )}
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
              {exhausted ? "You cleared the catalog" : "Run over"}
            </p>
            <p className="mt-1 text-6xl font-black tracking-tight text-white sm:text-7xl">{score}</p>
            <p className="text-sm text-white/60">tracks survived</p>
            <div className="mt-4 flex items-center justify-center gap-1">
              {Array.from({ length: strikesAllowed }).map((_, index) => {
                const lifeIndex = strikesAllowed - 1 - index;
                const alive = lifeIndex >= strikes;
                return (
                  <Heart
                    className={`h-4 w-4 ${alive ? "fill-rose-400 text-rose-400" : "text-rose-900"}`}
                    key={index}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button className="h-12 rounded-2xl px-6 font-bold" onClick={() => void startSurvival()} type="button">
              Play again
            </Button>
            <Button
              className="h-12 rounded-2xl px-6 font-bold"
              onClick={resetToSetup}
              type="button"
              variant="ghost"
            >
              Change settings
            </Button>
            <Link href="/quiz">
              <Button className="h-12 rounded-2xl px-6 font-bold" type="button" variant="ghost">
                Back to lobby
              </Button>
            </Link>
          </div>
          {errorMessage ? <ErrorState compact message={errorMessage} /> : null}
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
        ref={mainContainerRef}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
        ref={preloadContainerRef}
      />
    </div>
  );
}

