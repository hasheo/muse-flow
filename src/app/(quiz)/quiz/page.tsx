import Link from "next/link";
import { Play, Settings2 } from "lucide-react";

import { QuizLeaderboardTeaser } from "@/components/quiz/quiz-leaderboard-teaser";
import { QuizModesStrip } from "@/components/quiz/quiz-modes-strip";
import { QuizPublicLibraryView } from "@/components/quiz-public-library-view";

export default function QuizPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-10 px-4 pb-16 pt-4 sm:px-8 sm:pt-6 lg:px-12">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-lime-500/15 via-black/50 to-cyan-500/15 p-6 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime-400/20 blur-3xl sm:-right-10 sm:-top-10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-lime-400/40 bg-lime-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-lime-200">
              Play now
            </span>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Name that <span className="text-lime-300">track</span>.
              <br />
              Beat your <span className="text-cyan-300">score</span>.
            </h1>
            <p className="text-sm text-white/70 sm:text-base">
              Pick a playlist, hit play, and guess songs from tiny snippets. The shorter the clip, the
              bigger the flex.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-6 py-4 text-base font-black text-black shadow-lg shadow-lime-500/30 transition hover:-translate-y-0.5 hover:bg-lime-300"
              href="/quiz/setup"
            >
              <Play className="h-5 w-5 fill-current transition group-hover:scale-110" />
              Start a quiz
            </Link>
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-sm font-bold text-white transition hover:border-white/30 hover:bg-white/10"
              href="/quiz/setup"
            >
              <Settings2 className="h-4 w-4" />
              Create your own
            </Link>
          </div>
        </div>
      </section>

      <QuizModesStrip />

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
              Featured quizzes
            </h2>
            <p className="mt-1 text-lg font-black text-white sm:text-xl">Jump into a lobby</p>
          </div>
          <Link
            className="text-xs font-semibold text-lime-300 transition hover:text-lime-200"
            href="/quiz-companion"
          >
            Practice mode →
          </Link>
        </div>
        <QuizPublicLibraryView />
      </section>

      <QuizLeaderboardTeaser />
    </div>
  );
}
