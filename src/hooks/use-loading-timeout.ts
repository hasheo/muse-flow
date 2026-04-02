"use client";

import { useEffect, useRef } from "react";

import type { PlaybackState } from "@/store/player-store";

export interface UseLoadingTimeoutOptions {
  onStuck: () => void;
  timeoutMs?: number;
}

export function useLoadingTimeout(
  playbackState: PlaybackState,
  options: UseLoadingTimeoutOptions,
): void {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (playbackState !== "loading") return;

    const timeoutMs = optionsRef.current.timeoutMs ?? 4000;
    const timeoutId = setTimeout(() => {
      optionsRef.current.onStuck();
    }, timeoutMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [playbackState]);
}
