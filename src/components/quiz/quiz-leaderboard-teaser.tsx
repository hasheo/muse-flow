import { Trophy } from "lucide-react";

export function QuizLeaderboardTeaser() {
  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/50 via-black/30 to-transparent p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-rose-500 shadow-lg shadow-black/30">
            <Trophy className="h-5 w-5 text-black" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              Top players
            </p>
            <p className="text-base font-bold text-white sm:text-lg">
              Global leaderboard
            </p>
          </div>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
          Coming soon
        </span>
      </div>
      <p className="mt-3 text-sm text-white/60">
        Compete with players worldwide. Season leaderboards, survival streaks, and category
        rankings are on the way.
      </p>
    </section>
  );
}
