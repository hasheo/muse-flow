"use client";

import { Flame, Heart, Sparkles } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Track } from "@/lib/catalog";
import { getTimerAnnouncement } from "@/lib/quiz-utils";

type GameplayPhase = "playing" | "answering" | "revealed";
type GameplayAnswerMode = "typed" | "multiple_choice";

export type QuizGameplayScreenProps = {
  phase: GameplayPhase;
  questionNumber: number;
  totalQuestions: number;
  score: number;
  streak: number;
  timeLeft: number;
  maxAnswerTime?: number;
  snippetDurationSeconds: number;
  answerMode: GameplayAnswerMode;
  multipleChoiceOptions: string[];
  answerInput: string;
  onAnswerInputChange: (value: string) => void;
  onSubmitTypedAnswer: () => void;
  onSelectMultipleChoice: (option: string) => void;
  lastResult: null | boolean;
  revealTrack: Track | null;
  onNext: () => void;
  isLastQuestion: boolean;
  /** When set, show survival strikes (hearts) instead of the question counter + progress bar. */
  survivalStats?: { strikes: number; strikesAllowed: number };
};

const WAVEFORM_BARS = 28;

function Waveform({ active }: { active: boolean }) {
  const bars = useMemo(() => Array.from({ length: WAVEFORM_BARS }, (_, i) => i), []);
  return (
    <div aria-hidden className="flex h-16 items-end justify-center gap-[3px]">
      {bars.map((i) => (
        <span
          className={`w-1.5 rounded-full bg-lime-400 ${active ? "quiz-waveform-bar" : "opacity-30"}`}
          key={i}
          style={
            active
              ? {
                  animationDelay: `${(i % 10) * 80}ms`,
                  animationDuration: `${600 + ((i * 37) % 500)}ms`,
                }
              : { height: "10%" }
          }
        />
      ))}
    </div>
  );
}

function TimerRing({
  timeLeft,
  maxTime,
  phase,
  snippetDurationSeconds,
}: {
  timeLeft: number;
  maxTime: number;
  phase: GameplayPhase;
  snippetDurationSeconds: number;
}) {
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const circumference = 2 * Math.PI * 80;
  const dashOffset = circumference * (1 - progress);

  const ringColor =
    phase === "playing"
      ? "stroke-lime-400"
      : timeLeft <= 3
        ? "stroke-rose-400"
        : "stroke-cyan-300";

  return (
    <div className="relative grid h-52 w-52 place-items-center sm:h-64 sm:w-64">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 180 180">
        <circle
          className="stroke-white/10"
          cx={90}
          cy={90}
          fill="none"
          r={80}
          strokeWidth={6}
        />
        <circle
          className={`${ringColor} transition-[stroke-dashoffset] duration-700 ease-linear`}
          cx={90}
          cy={90}
          fill="none"
          r={80}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={6}
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
          {phase === "playing" ? `${snippetDurationSeconds}s snippet` : "answer"}
        </span>
        <span className="text-6xl font-black tabular-nums text-white sm:text-7xl">
          {timeLeft}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
          seconds
        </span>
      </div>
    </div>
  );
}

export function QuizGameplayScreen({
  phase,
  questionNumber,
  totalQuestions,
  score,
  streak,
  timeLeft,
  maxAnswerTime = 15,
  snippetDurationSeconds,
  answerMode,
  multipleChoiceOptions,
  answerInput,
  onAnswerInputChange,
  onSubmitTypedAnswer,
  onSelectMultipleChoice,
  lastResult,
  revealTrack,
  onNext,
  isLastQuestion,
  survivalStats,
}: QuizGameplayScreenProps) {
  const timerAnnouncement = phase === "playing" || phase === "answering" ? getTimerAnnouncement(timeLeft) : "";
  const progressPct = Math.round((questionNumber / totalQuestions) * 100);
  const isSurvival = Boolean(survivalStats);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-16 pt-4 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        {isSurvival && survivalStats ? (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Survived
            </span>
            <span className="text-2xl font-black tabular-nums text-white sm:text-3xl">
              {score}
            </span>
            <span className="text-sm font-semibold uppercase tabular-nums tracking-wider text-white/40">
              in a row
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Question
            </span>
            <span className="text-2xl font-black tabular-nums text-white sm:text-3xl">
              {questionNumber}
            </span>
            <span className="text-sm font-semibold tabular-nums text-white/40">
              / {totalQuestions}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          {isSurvival && survivalStats ? (
            <div className="flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1">
              {Array.from({ length: survivalStats.strikesAllowed }).map((_, index) => {
                const lifeIndex = survivalStats.strikesAllowed - 1 - index;
                const alive = lifeIndex >= survivalStats.strikes;
                return (
                  <Heart
                    aria-hidden
                    className={`h-3.5 w-3.5 transition ${
                      alive ? "fill-rose-400 text-rose-400" : "text-rose-900"
                    }`}
                    key={index}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1">
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-bold tabular-nums text-amber-200">{streak}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-lime-300" />
            <span className="text-xs font-bold tabular-nums text-lime-100">{score}</span>
          </div>
        </div>
      </header>

      {!isSurvival ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-lime-400 via-cyan-300 to-fuchsia-400 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only" role="status">
        {timerAnnouncement}
      </p>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 sm:gap-12 sm:py-12">
        {phase !== "revealed" ? (
          <>
            <TimerRing
              maxTime={maxAnswerTime}
              phase={phase}
              snippetDurationSeconds={snippetDurationSeconds}
              timeLeft={timeLeft}
            />
            <Waveform active={phase === "playing"} />
            <p className="text-center text-sm font-medium text-white/70 sm:text-base">
              {phase === "playing"
                ? "Listen carefully — name that track"
                : "Snippet finished. Lock in your answer."}
            </p>
          </>
        ) : null}

        {phase === "revealed" && revealTrack ? (
          <div
            className={`quiz-reveal-pop flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border p-6 text-center shadow-2xl sm:p-8 ${
              lastResult
                ? "border-lime-300/40 bg-gradient-to-b from-lime-500/20 to-lime-950/60 shadow-lime-500/20"
                : "border-rose-300/40 bg-gradient-to-b from-rose-500/20 to-rose-950/60 shadow-rose-500/20"
            }`}
          >
            <span
              className={`rounded-full px-4 py-1 text-xs font-black uppercase tracking-[0.3em] ${
                lastResult ? "bg-lime-400 text-black" : "bg-rose-400 text-black"
              }`}
            >
              {lastResult ? "Correct" : "Missed"}
            </span>
            <Image
              alt={revealTrack.title}
              className="aspect-square w-44 rounded-2xl object-cover shadow-lg shadow-black/40 sm:w-56"
              height={224}
              src={revealTrack.cover}
              unoptimized
              width={224}
            />
            <div className="w-full space-y-1">
              <p className="truncate text-xl font-black text-white sm:text-2xl">
                {revealTrack.title}
              </p>
              <p className="truncate text-sm text-white/60 sm:text-base">{revealTrack.artist}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-auto">
        {(phase === "playing" || phase === "answering") && answerMode === "typed" ? (
          <form
            className="mx-auto flex w-full max-w-xl flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitTypedAnswer();
            }}
          >
            <Input
              autoFocus
              className="h-14 rounded-2xl border-white/20 bg-white/5 px-5 text-lg font-medium placeholder-white/40 focus-visible:border-lime-400/60"
              onChange={(event) => onAnswerInputChange(event.target.value)}
              placeholder="Type the song title..."
              value={answerInput}
            />
            <Button className="h-12 rounded-2xl text-base font-bold" type="submit">
              Submit answer
            </Button>
          </form>
        ) : null}

        {(phase === "playing" || phase === "answering") && answerMode === "multiple_choice" ? (
          <div className="mx-auto grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            {multipleChoiceOptions.map((option, index) => (
              <button
                className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-lime-400/60 hover:bg-lime-400/10"
                key={`${option}-${index}`}
                onClick={() => onSelectMultipleChoice(option)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/30 text-sm font-black text-white/70 transition group-hover:border-lime-400/60 group-hover:text-lime-200">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="truncate text-sm font-semibold text-white sm:text-base">
                  {option}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {phase === "revealed" ? (
          <div className="mx-auto flex w-full max-w-md justify-center">
            <Button
              className="h-12 rounded-2xl px-8 text-base font-bold"
              onClick={onNext}
              type="button"
            >
              {isSurvival ? "Next track" : isLastQuestion ? "Finish quiz" : "Next question"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
