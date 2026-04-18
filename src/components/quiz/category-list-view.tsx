"use client";

import Link from "next/link";
import { ArrowLeft, Layers, Music } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type Category = {
  name: string;
  slug: string;
  count: number;
};

type LoadState = "loading" | "ready" | "error";

const ACCENTS = [
  "from-cyan-400 to-fuchsia-500",
  "from-amber-400 to-rose-500",
  "from-lime-400 to-emerald-500",
  "from-violet-400 to-indigo-500",
  "from-sky-400 to-teal-500",
  "from-pink-400 to-orange-500",
];

function accentFor(slug: string, index: number): string {
  // Deterministic colour per slug so the same category always shows the same
  // card colour across loads. Falls back to positional index if the hash
  // collides with itself (not a correctness issue, just aesthetics).
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[(hash + index) % ACCENTS.length];
}

export function CategoryListView() {
  const [state, setState] = useState<LoadState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/quiz/categories", { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || "Failed to load categories");
        }
        const payload = (await response.json()) as { categories?: Category[] };
        if (cancelled) return;
        setCategories(payload.categories ?? []);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load categories");
        setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-2 sm:px-8">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition hover:text-white"
          href="/quiz"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lobby
        </Link>
        <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100">
          Category mode
        </span>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="space-y-2 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300">
            Pick your vibe
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
            Category
          </h1>
          <p className="text-sm text-white/60 sm:text-base">
            Survival runs filtered by theme. Three strikes — how many Anime openings can you name?
          </p>
        </div>

        {state === "loading" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                className="h-36 animate-pulse rounded-3xl border border-white/10 bg-white/5"
                key={index}
              />
            ))}
          </div>
        ) : null}

        {state === "error" ? (
          <ErrorState message={errorMessage ?? "Something went wrong"} />
        ) : null}

        {state === "ready" && categories.length === 0 ? (
          <div className="rounded-3xl border border-amber-300/30 bg-amber-300/5 p-8 text-center">
            <Music className="mx-auto h-10 w-10 text-amber-200" />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-200">
              No categories yet
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Nothing to filter by
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Ask an admin to tag some catalog tracks with a category and they&apos;ll show up here.
            </p>
            <div className="mt-5 flex justify-center">
              <Link href="/quiz/survival">
                <Button className="h-11 rounded-2xl px-5 font-bold" type="button">
                  Play uncategorized survival
                </Button>
              </Link>
            </div>
          </div>
        ) : null}

        {state === "ready" && categories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <Link
                className="group relative overflow-hidden rounded-3xl border border-white/15 bg-black/40 p-5 transition hover:-translate-y-0.5 hover:border-white/30"
                href={`/quiz/category/${category.slug}`}
                key={category.slug}
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -inset-px -z-10 bg-gradient-to-br ${accentFor(
                    category.slug,
                    index,
                  )} opacity-15 transition group-hover:opacity-25`}
                />
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${accentFor(
                      category.slug,
                      index,
                    )} shadow-lg shadow-black/30`}
                  >
                    <Layers className="h-5 w-5 text-black" />
                  </div>
                  <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                    {category.count} {category.count === 1 ? "track" : "tracks"}
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-lg font-black text-white">{category.name}</p>
                  <p className="mt-1 text-sm text-white/60">
                    Three strikes, themed.
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
