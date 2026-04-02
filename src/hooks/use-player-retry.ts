"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_DELAY_MS = 900;

export interface UsePlayerRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  onRetriesExhausted: (trackKey: string) => void;
}

export interface UsePlayerRetryReturn {
  scheduleRetry: (trackKey: string, retryFn: () => void) => boolean;
  resetRetry: (newTrackKey?: string) => void;
}

export function usePlayerRetry(
  options: UsePlayerRetryOptions,
): UsePlayerRetryReturn {
  const attemptRef = useRef<number>(0);
  const trackKeyRef = useRef<string>("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store options in a ref so callbacks are always current without stale closures.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (trackKey: string, retryFn: () => void): boolean => {
      if (!trackKey) return false;

      // If this is a different track, reset the counter and update the tracked key.
      if (trackKeyRef.current !== trackKey) {
        attemptRef.current = 0;
        trackKeyRef.current = trackKey;
      }

      const { maxAttempts = DEFAULT_MAX_ATTEMPTS, delayMs = DEFAULT_DELAY_MS } =
        optionsRef.current;

      if (attemptRef.current >= maxAttempts) {
        optionsRef.current.onRetriesExhausted(trackKey);
        return false;
      }

      attemptRef.current += 1;
      clearTimer();

      // Capture the track key at scheduling time for the stale guard below.
      const scheduledTrackKey = trackKey;

      timeoutRef.current = setTimeout(() => {
        // Stale guard: skip the retry if the user changed tracks while the
        // timeout was pending.
        if (trackKeyRef.current === scheduledTrackKey) {
          retryFn();
        }
      }, delayMs);

      return true;
    },
    [clearTimer],
  );

  const resetRetry = useCallback(
    (newTrackKey?: string): void => {
      clearTimer();
      attemptRef.current = 0;
      if (newTrackKey !== undefined) {
        trackKeyRef.current = newTrackKey;
      }
    },
    [clearTimer],
  );

  // Auto-cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { scheduleRetry, resetRetry };
}
