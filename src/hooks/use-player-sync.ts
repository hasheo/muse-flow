"use client";

import { useCallback, useEffect, useRef } from "react";

import { type YouTubePlayer } from "@/lib/youtube";

const SYNC_INTERVAL_MS = 250;

export interface UsePlayerSyncCallbacks {
  setProgress: (seconds: number) => void;
  setDuration: (seconds: number) => void;
}

export interface UsePlayerSyncReturn {
  startSync: () => void;
  stopSync: () => void;
}

export function usePlayerSync(
  playerRef: React.RefObject<YouTubePlayer | null>,
  callbacks: UsePlayerSyncCallbacks,
): UsePlayerSyncReturn {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store callbacks in a ref so they're always up-to-date without restarting the interval
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const stopSync = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startSync = useCallback(() => {
    // Clear any existing interval before starting a new one
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = setInterval(() => {
      // Guard: skip the poll tick if player is not ready yet (don't stop the interval)
      if (!playerRef.current) return;

      const durationValue = playerRef.current.getDuration();
      const progressValue = playerRef.current.getCurrentTime();

      if (Number.isFinite(durationValue)) {
        callbacksRef.current.setDuration(durationValue);
      }
      if (Number.isFinite(progressValue)) {
        callbacksRef.current.setProgress(progressValue);
      }
    }, SYNC_INTERVAL_MS);
  }, [playerRef]);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      stopSync();
    };
  }, [stopSync]);

  return { startSync, stopSync };
}
