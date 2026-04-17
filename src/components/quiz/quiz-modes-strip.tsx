import Link from "next/link";
import { Flame, Layers, ListMusic, Lock } from "lucide-react";

type Mode = {
  id: string;
  title: string;
  tagline: string;
  icon: typeof Layers;
  href?: string;
  accent: string;
  status: "active" | "coming-soon";
};

const MODES: Mode[] = [
  {
    id: "playlist",
    title: "Playlist Quiz",
    tagline: "Guess tracks from a curated playlist.",
    icon: ListMusic,
    href: "/quiz/setup",
    accent: "from-lime-400 to-emerald-500",
    status: "active",
  },
  {
    id: "survival",
    title: "Survival",
    tagline: "Keep answering until you miss one. Chase your record.",
    icon: Flame,
    accent: "from-amber-400 to-rose-500",
    status: "coming-soon",
  },
  {
    id: "category",
    title: "Category",
    tagline: "Pick a vibe \u2014 Anime, J-Pop, K-Pop, and more.",
    icon: Layers,
    accent: "from-cyan-400 to-fuchsia-500",
    status: "coming-soon",
  },
];

export function QuizModesStrip() {
  return (
    <section>
      <h2 className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
        Game modes
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const cardClasses =
            mode.status === "active"
              ? "group relative overflow-hidden rounded-3xl border border-white/15 bg-black/40 p-5 transition hover:-translate-y-0.5 hover:border-white/30"
              : "group relative overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5 opacity-70";

          const inner = (
            <>
              <div
                aria-hidden
                className={`pointer-events-none absolute -inset-px -z-10 bg-gradient-to-br ${mode.accent} opacity-15 transition group-hover:opacity-25`}
              />
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${mode.accent} shadow-lg shadow-black/30`}
                >
                  <Icon className="h-5 w-5 text-black" />
                </div>
                {mode.status === "coming-soon" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                    <Lock className="h-3 w-3" />
                    Soon
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-lime-400/40 bg-lime-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-200">
                    Play
                  </span>
                )}
              </div>
              <div className="mt-4">
                <p className="text-lg font-black text-white">{mode.title}</p>
                <p className="mt-1 text-sm text-white/60">{mode.tagline}</p>
              </div>
            </>
          );

          if (mode.status === "active" && mode.href) {
            return (
              <Link className={cardClasses} href={mode.href} key={mode.id}>
                {inner}
              </Link>
            );
          }

          return (
            <div aria-disabled className={cardClasses} key={mode.id}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
