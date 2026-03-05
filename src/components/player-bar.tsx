"use client";

import { AlertCircle, Loader2, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/store/player-store";

function formatDuration(duration: number) {
  const safe = Number.isFinite(duration) ? duration : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function AnalyserVisualizer() {
  const analyserData = usePlayerStore((s) => s.analyserData);

  return (
    <div className="hidden h-8 items-end gap-[2px] lg:flex">
      {Array.from(analyserData.slice(0, 36)).map((item, idx) => (
        <div
          className="w-1 rounded-sm bg-lime-400/80"
          key={idx}
          style={{ height: `${Math.max(8, (item / 255) * 32)}px` }}
        />
      ))}
    </div>
  );
}

export function PlayerBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const playbackError = usePlayerStore((s) => s.playbackError);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const toggle = usePlayerStore((s) => s.toggle);
  const previous = usePlayerStore((s) => s.previous);
  const next = usePlayerStore((s) => s.next);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setProgress = usePlayerStore((s) => s.setProgress);

  if (!currentTrack) {
    return null;
  }

  return (
    <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/85 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 lg:gap-6">
        <div className="min-w-0 flex flex-1 items-center gap-3">
          <Image alt={currentTrack.title} className="h-12 w-12 rounded-md object-cover" height={48} src={currentTrack.cover} unoptimized width={48} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{currentTrack.title}</p>
            <p className="truncate text-xs text-white/60">{currentTrack.artist}</p>
          </div>
        </div>

        <div className="flex flex-1.5 flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <Button onClick={previous} size="icon" variant="ghost">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button onClick={toggle} size="icon" variant="default">
              {playbackState === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={next} size="icon" variant="ghost">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          {playbackState === "error" && playbackError ? (
            <div className="flex items-center justify-center gap-1 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="truncate">{playbackError}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="w-10 text-right text-xs text-white/55">{formatDuration(progress)}</span>
            <Slider
              max={duration || 1}
              onValueChange={(value) => setProgress(value[0] ?? 0)}
              value={[progress]}
            />
            <span className="w-10 text-xs text-white/55">{formatDuration(duration)}</span>
          </div>
          <AnalyserVisualizer />
        </div>

        <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
          <Volume2 className="h-4 w-4 text-white/70" />
          <div className="w-32">
            <Slider max={1} onValueChange={(value) => setVolume(value[0] ?? 0)} step={0.01} value={[volume]} />
          </div>
        </div>
      </div>
    </footer>
  );
}
