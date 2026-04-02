# AudioEngine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `audio-engine.tsx` (349 lines, 8 refs, 5 effects) into 3 focused hooks + a thin orchestrator, fixing known race conditions along the way.

**Architecture:** Reuse the existing `useYouTubePlayer` hook for player lifecycle. Extract sync polling into `usePlayerSync`, retry logic into `usePlayerRetry`, and stuck-loading detection into `useLoadingTimeout`. The `AudioEngine` component becomes a ~80-line orchestrator that reads/writes the Zustand store and wires hooks together.

**Tech Stack:** React 19, Zustand 5, YouTube IFrame API, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-01-audio-engine-refactor-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/use-player-sync.ts` | Create | Poll YouTube player for progress/duration every 250ms |
| `src/hooks/use-player-retry.ts` | Create | Track retry attempts per track, schedule retries with delay |
| `src/hooks/use-loading-timeout.ts` | Create | Detect stuck "loading" state, trigger recovery callback |
| `src/components/player/audio-engine.tsx` | Rewrite | Thin orchestrator wiring hooks to Zustand store |
| `src/hooks/use-youtube-player.ts` | No change | Already exists, reused as-is. Has lifecycle management, callback refs, cancel guard, and child-div mount pattern. Covers the spec's `useYouTubePlayer` requirements. |

---

## Task 1: Create usePlayerSync hook

**Files:**
- Create: `src/hooks/use-player-sync.ts`

- [ ] **Step 1: Create the hook file**

```ts
// src/hooks/use-player-sync.ts
"use client";

import { useCallback, useRef } from "react";
import type { YouTubePlayer } from "@/lib/youtube";

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
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const stopSync = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startSync = useCallback(() => {
    stopSync();
    intervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const duration = player.getDuration();
      const progress = player.getCurrentTime();
      if (Number.isFinite(duration)) {
        callbacksRef.current.setDuration(duration);
      }
      if (Number.isFinite(progress)) {
        callbacksRef.current.setProgress(progress);
      }
    }, SYNC_INTERVAL_MS);
  }, [playerRef, stopSync]);

  return { startSync, stopSync };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `use-player-sync.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-player-sync.ts
git commit -m "feat: add usePlayerSync hook for progress/duration polling"
```

---

## Task 2: Create usePlayerRetry hook

**Files:**
- Create: `src/hooks/use-player-retry.ts`

- [ ] **Step 1: Create the hook file**

```ts
// src/hooks/use-player-retry.ts
"use client";

import { useCallback, useRef } from "react";

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_DELAY_MS = 900;

export interface UsePlayerRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  onRetriesExhausted: (trackKey: string) => void;
}

export interface UsePlayerRetryReturn {
  /**
   * Schedule a retry for the given track. Returns true if a retry was
   * scheduled, false if retries are exhausted.
   *
   * The retryFn is guarded: if the track key has changed by the time the
   * timeout fires (user switched tracks), the callback is skipped.
   */
  scheduleRetry: (trackKey: string, retryFn: () => void) => boolean;
  /** Clear pending retry timeout and reset attempt counter. */
  resetRetry: (newTrackKey?: string) => void;
}

export function usePlayerRetry(
  options: UsePlayerRetryOptions,
): UsePlayerRetryReturn {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  const attemptRef = useRef(0);
  const trackKeyRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetRetry = useCallback(
    (newTrackKey?: string) => {
      clearTimer();
      attemptRef.current = 0;
      if (newTrackKey !== undefined) {
        trackKeyRef.current = newTrackKey;
      }
    },
    [clearTimer],
  );

  const scheduleRetry = useCallback(
    (trackKey: string, retryFn: () => void): boolean => {
      if (!trackKey) return false;

      // New track — reset counter
      if (trackKeyRef.current !== trackKey) {
        trackKeyRef.current = trackKey;
        attemptRef.current = 0;
      }

      if (attemptRef.current >= maxAttempts) {
        optionsRef.current.onRetriesExhausted(trackKey);
        return false;
      }

      attemptRef.current += 1;
      clearTimer();

      const scheduledTrackKey = trackKey;
      timeoutRef.current = setTimeout(() => {
        // Stale guard: if the user changed tracks while we waited, skip
        if (trackKeyRef.current !== scheduledTrackKey) return;
        retryFn();
      }, delayMs);

      return true;
    },
    [clearTimer, delayMs, maxAttempts],
  );

  return { scheduleRetry, resetRetry };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `use-player-retry.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-player-retry.ts
git commit -m "feat: add usePlayerRetry hook with stale track guard"
```

---

## Task 3: Create useLoadingTimeout hook

**Files:**
- Create: `src/hooks/use-loading-timeout.ts`

- [ ] **Step 1: Create the hook file**

```ts
// src/hooks/use-loading-timeout.ts
"use client";

import { useEffect, useRef } from "react";
import type { PlaybackState } from "@/store/player-store";

const DEFAULT_TIMEOUT_MS = 4000;

export interface UseLoadingTimeoutOptions {
  /** Called when playback has been stuck in "loading" state beyond the timeout. */
  onStuck: () => void;
  timeoutMs?: number;
}

/**
 * Watches playbackState and fires `onStuck` if it stays "loading" for too
 * long. Auto-clears when the state changes or the component unmounts.
 */
export function useLoadingTimeout(
  playbackState: PlaybackState,
  options: UseLoadingTimeoutOptions,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (playbackState !== "loading") return;

    const timeoutMs = optionsRef.current.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const id = setTimeout(() => {
      optionsRef.current.onStuck();
    }, timeoutMs);

    return () => clearTimeout(id);
  }, [playbackState]);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `use-loading-timeout.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-loading-timeout.ts
git commit -m "feat: add useLoadingTimeout hook for stuck-loading recovery"
```

---

## Task 4: Rewrite AudioEngine as orchestrator

**Files:**
- Rewrite: `src/components/player/audio-engine.tsx`

This is the main task. AudioEngine now uses the existing `useYouTubePlayer` hook (from `src/hooks/use-youtube-player.ts`) plus the 3 new hooks to compose all player behavior.

- [ ] **Step 1: Rewrite audio-engine.tsx**

```tsx
// src/components/player/audio-engine.tsx
"use client";

import { useEffect, useRef } from "react";

import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { usePlayerSync } from "@/hooks/use-player-sync";
import { usePlayerRetry } from "@/hooks/use-player-retry";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";
import { usePlayerStore, type PlaybackState } from "@/store/player-store";
import type { YouTubePlayerEvent } from "@/lib/youtube";

const PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };
const FORCE_PLAY_DELAY_MS = 1500;

export function AudioEngine() {
  // ── Store reads ──
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const progress = usePlayerStore((s) => s.progress);
  const playbackState = usePlayerStore((s) => s.playbackState);

  // Ref to prevent the isPlaying effect from double-loading when the
  // currentTrack effect already handled it in the same render cycle.
  const trackLoadedRef = useRef(false);
  // Ref to hold the delayed play() after force-reload so we can cancel it.
  const forcePlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── YouTube player lifecycle (reuse existing hook) ──
  const { playerRef, readyRef, containerRef } = useYouTubePlayer({
    playerVars: PLAYER_VARS,
    onReady: () => {
      const store = usePlayerStore.getState();
      const player = playerRef.current;
      if (!player) return;

      player.setVolume(Math.round(store.volume * 100));

      if (store.currentTrack) {
        resetRetry(`youtube:${store.currentTrack.id}`);
        if (store.isPlaying) {
          store.setPlaybackState("loading");
          player.loadVideoById(store.currentTrack.youtubeVideoId);
          startSync();
        } else {
          store.setPlaybackState("paused");
          player.cueVideoById(store.currentTrack.youtubeVideoId);
        }
      }
    },
    onStateChange: (event: YouTubePlayerEvent) => {
      const store = usePlayerStore.getState();

      // PLAYING
      if (event.data === 1) {
        store.setPlaying(true);
        store.setPlaybackState("playing");
        store.setPlaybackError(null);
        resetRetry();
        startSync();
        return;
      }

      // PAUSED
      if (event.data === 2) {
        store.setPlaying(false);
        store.setPlaybackState(store.currentTrack ? "paused" : "idle");
        stopSync();
        return;
      }

      // BUFFERING (3) or UNSTARTED (-1)
      if (event.data === 3 || event.data === -1) {
        if (store.currentTrack) {
          store.setPlaybackState("loading");
        }
        return;
      }

      // ENDED (0)
      if (event.data === 0) {
        store.setPlaying(false);
        store.setPlaybackState("paused");
        stopSync();
        store.next();
      }
    },
    onError: () => {
      const store = usePlayerStore.getState();
      const track = store.currentTrack;
      const player = playerRef.current;
      if (!track || !player) return;

      const trackKey = `youtube:${track.id}`;
      const didSchedule = scheduleRetry(trackKey, () => {
        const s = usePlayerStore.getState();
        if (!s.isPlaying) return;
        s.setPlaybackState("loading");
        player.loadVideoById(track.youtubeVideoId);
        startSync();
      });

      if (!didSchedule) {
        store.setPlaying(false);
        store.setPlaybackState("error");
        store.setPlaybackError("Failed to play YouTube stream. Try playing again.");
        stopSync();
      } else {
        store.setPlaybackState("loading");
        store.setPlaybackError("Connection interrupted, retrying playback...");
      }
    },
  });

  // ── Sync polling ──
  const { startSync, stopSync } = usePlayerSync(playerRef, {
    setProgress: usePlayerStore.getState().setProgress,
    setDuration: usePlayerStore.getState().setDuration,
  });

  // ── Retry logic ──
  const { scheduleRetry, resetRetry } = usePlayerRetry({
    onRetriesExhausted: () => {
      const store = usePlayerStore.getState();
      store.setPlaying(false);
      store.setPlaybackState("error");
      store.setPlaybackError("Failed to play YouTube stream. Try playing again.");
      stopSync();
    },
  });

  // ── Stuck-loading recovery ──
  useLoadingTimeout(playbackState, {
    onStuck: () => {
      const store = usePlayerStore.getState();
      const player = playerRef.current;
      if (!player || !store.isPlaying || !store.currentTrack) return;

      player.loadVideoById(store.currentTrack.youtubeVideoId);

      // Clear any previous force-play timeout
      if (forcePlayTimeoutRef.current) {
        clearTimeout(forcePlayTimeoutRef.current);
      }
      forcePlayTimeoutRef.current = setTimeout(() => {
        const s = usePlayerStore.getState();
        if (s.isPlaying && s.playbackState !== "playing" && playerRef.current) {
          playerRef.current.playVideo();
        }
        forcePlayTimeoutRef.current = null;
      }, FORCE_PLAY_DELAY_MS);
    },
  });

  // ── Effect: volume changes ──
  useEffect(() => {
    if (playerRef.current && readyRef.current) {
      playerRef.current.setVolume(Math.round(volume * 100));
    }
  }, [volume, playerRef, readyRef]);

  // ── Effect: track changes ──
  useEffect(() => {
    const player = playerRef.current;
    const store = usePlayerStore.getState();

    if (!currentTrack) {
      resetRetry();
      stopSync();
      player?.stopVideo();
      store.setPlaybackState("idle");
      store.setPlaybackError(null);
      return;
    }

    const trackKey = `youtube:${currentTrack.id}`;
    resetRetry(trackKey);
    store.setPlaybackError(null);
    store.setAnalyserData(new Uint8Array(64));

    if (!player || !readyRef.current) {
      if (store.isPlaying) {
        store.setPlaybackState("loading");
      }
      return;
    }

    trackLoadedRef.current = true;
    if (store.isPlaying) {
      store.setPlaybackState("loading");
      player.loadVideoById(currentTrack.youtubeVideoId);
      startSync();
    } else {
      store.setPlaybackState("paused");
      player.cueVideoById(currentTrack.youtubeVideoId);
    }
  }, [currentTrack, playerRef, readyRef, resetRetry, startSync, stopSync]);

  // ── Effect: play/pause toggle ──
  useEffect(() => {
    if (trackLoadedRef.current) {
      trackLoadedRef.current = false;
      return;
    }

    if (!currentTrack) return;
    if (!playerRef.current || !readyRef.current) {
      if (isPlaying) {
        usePlayerStore.getState().setPlaybackState("loading");
      }
      return;
    }

    if (isPlaying) {
      usePlayerStore.getState().setPlaybackState("loading");
      playerRef.current.playVideo();
      startSync();
    } else {
      playerRef.current.pauseVideo();
      stopSync();
      usePlayerStore.getState().setPlaybackState("paused");
    }
  }, [currentTrack, isPlaying, playerRef, readyRef, startSync, stopSync]);

  // ── Effect: seek detection ──
  useEffect(() => {
    if (!currentTrack) return;
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - progress) > 1) {
      player.seekTo(progress, true);
    }
  }, [currentTrack, progress, playerRef, readyRef]);

  // ── Cleanup force-play timeout on unmount ──
  useEffect(() => {
    return () => {
      if (forcePlayTimeoutRef.current) {
        clearTimeout(forcePlayTimeoutRef.current);
      }
    };
  }, []);

  return <div aria-hidden className="hidden" ref={containerRef} />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 3: Run ESLint**

Run: `npx eslint src/components/player/audio-engine.tsx src/hooks/use-player-sync.ts src/hooks/use-player-retry.ts src/hooks/use-loading-timeout.ts 2>&1 | tail -10`
Expected: No lint errors (or only pre-existing warnings)

- [ ] **Step 4: Commit**

```bash
git add src/components/player/audio-engine.tsx
git commit -m "refactor: rewrite AudioEngine as thin orchestrator using extracted hooks"
```

---

## Task 5: Smoke test playback manually

This refactor touches the core playback path. Automated tests for YouTube IFrame API integration are impractical (requires a browser + real YouTube), so manual verification is essential.

- [ ] **Step 1: Start dev server**

Run: `npx next dev`

- [ ] **Step 2: Test basic playback**

1. Open http://localhost:3000/app
2. Search for a song and play it
3. Verify: song plays, progress bar updates, duration displays correctly

- [ ] **Step 3: Test play/pause/seek**

1. Click pause — verify playback pauses, progress stops updating
2. Click play — verify playback resumes
3. Drag seek bar — verify playback jumps to new position

- [ ] **Step 4: Test track switching**

1. Play a song, then click a different song
2. Verify: old song stops, new song starts, progress resets to 0
3. Click next/previous buttons — verify they work

- [ ] **Step 5: Test volume**

1. Adjust volume slider — verify audio volume changes

- [ ] **Step 6: Test error recovery**

1. If possible, play a restricted/unavailable video
2. Verify: retry message appears briefly, then error state shows after retries exhausted

- [ ] **Step 7: Run existing tests to check nothing else broke**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All existing tests pass

- [ ] **Step 8: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "refactor: complete AudioEngine hook extraction with smoke test verification"
```
