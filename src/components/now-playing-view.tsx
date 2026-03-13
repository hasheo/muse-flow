"use client";

import { ChevronDown, Loader2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/store/player-store";

type NowPlayingViewProps = {
  open: boolean;
  onClose: () => void;
};

function QueueList({ onTrackClick }: { onTrackClick: (id: string) => void }) {
  const tracks = usePlayerStore((s) => s.tracks);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  if (!tracks.length) return null;

  const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
  const upNext = currentIndex >= 0 ? [...tracks.slice(currentIndex + 1), ...tracks.slice(0, currentIndex)] : tracks;

  return (
    <div className="space-y-1">
      {upNext.map((track) => (
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
          key={track.id}
          onClick={() => onTrackClick(track.id)}
          type="button"
        >
          <Image
            alt={track.title}
            className="h-10 w-10 shrink-0 rounded object-cover"
            height={40}
            src={track.cover}
            width={40}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-white/60">{track.artist}</p>
          </div>
          <span className="shrink-0 text-xs text-white/50">{formatDuration(track.duration)}</span>
        </button>
      ))}
    </div>
  );
}

export function NowPlayingView({ open, onClose }: NowPlayingViewProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const toggle = usePlayerStore((s) => s.toggle);
  const previous = usePlayerStore((s) => s.previous);
  const next = usePlayerStore((s) => s.next);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const tracks = usePlayerStore((s) => s.tracks);
  const playTrack = usePlayerStore((s) => s.playTrack);

  if (!open || !currentTrack) return null;

  const handleQueueTrackClick = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (track) {
      playTrack(track, tracks);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 lg:bg-black/90">
      {/* Mobile layout */}
      <div className="flex h-full flex-col lg:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <p className="text-xs uppercase tracking-[0.15em] text-white/50">Now Playing</p>
          <div className="w-10" />
        </div>

        {/* Cover art */}
        <div className="flex flex-1 items-center justify-center px-8">
          <Image
            alt={currentTrack.title}
            className="w-full max-w-xs rounded-lg object-cover shadow-2xl"
            height={320}
            src={currentTrack.cover}
            width={320}
            priority
          />
        </div>

        {/* Track info + controls */}
        <div className="px-6 pb-8">
          <div className="mb-4">
            <p className="text-lg font-semibold">{currentTrack.title}</p>
            <p className="text-sm text-white/60">{currentTrack.artist}</p>
          </div>

          {/* Progress */}
          <div className="mb-2">
            <Slider
              aria-label="Playback progress"
              max={duration || 1}
              onValueChange={(value) => setProgress(value[0] ?? 0)}
              value={[progress]}
            />
            <div className="mt-1 flex justify-between text-xs text-white/50">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-6">
            <Button aria-label="Previous track" className="h-12 w-12" onClick={previous} size="icon" variant="ghost">
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button aria-label={isPlaying ? "Pause" : "Play"} className="h-14 w-14" onClick={toggle} size="icon" variant="default">
              {playbackState === "loading" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
            <Button aria-label="Next track" className="h-12 w-12" onClick={next} size="icon" variant="ghost">
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden h-full lg:flex">
        {/* Cover art side */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center px-6 py-4">
            <button
              className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              <ChevronDown className="h-6 w-6" />
            </button>
            <p className="ml-3 text-sm uppercase tracking-[0.15em] text-white/50">Now Playing</p>
          </div>

          {/* Centered cover */}
          <div className="flex flex-1 items-center justify-center px-12">
            <Image
              alt={currentTrack.title}
              className="max-h-[70vh] w-full max-w-lg rounded-lg object-cover shadow-2xl"
              height={600}
              src={currentTrack.cover}
              width={600}
              priority
            />
          </div>
        </div>

        {/* Queue side panel */}
        <div className="flex w-[400px] flex-col border-l border-white/10 bg-black/50">
          {/* Queue header */}
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Up Next</p>
          </div>

          {/* Current track info */}
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <Image
                alt={currentTrack.title}
                className="h-12 w-12 rounded object-cover"
                height={48}
                src={currentTrack.cover}
                width={48}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{currentTrack.title}</p>
                <p className="truncate text-sm text-white/60">{currentTrack.artist}</p>
              </div>
              <span className="shrink-0 text-xs text-white/50">{formatDuration(duration)}</span>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <Slider
                aria-label="Playback progress"
                max={duration || 1}
                onValueChange={(value) => setProgress(value[0] ?? 0)}
                value={[progress]}
              />
              <div className="mt-1 flex justify-between text-xs text-white/50">
                <span>{formatDuration(progress)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-2 flex items-center justify-center gap-3">
              <Button aria-label="Previous track" onClick={previous} size="icon" variant="ghost">
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button aria-label={isPlaying ? "Pause" : "Play"} onClick={toggle} size="icon" variant="default">
                {playbackState === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button aria-label="Next track" onClick={next} size="icon" variant="ghost">
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <QueueList onTrackClick={handleQueueTrackClick} />
          </div>
        </div>
      </div>
    </div>
  );
}
