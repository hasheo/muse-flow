# YouTube Hook Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract ~400 lines of duplicated YouTube IFrame API code into a shared module (`src/lib/youtube.ts`) and reusable hook (`src/hooks/use-youtube-player.ts`), then migrate all 4 consumer components.

**Architecture:** A pure TypeScript module holds shared types and the `loadYouTubeApi()` function. A React hook encapsulates the imperative mount pattern (create child div, create player, track readiness, cleanup). Each quiz component uses the hook 2x (main + preload players). `audio-engine.tsx` only imports types + loader since its lifecycle is too different for the hook.

**Tech Stack:** React 19, TypeScript 5, Next.js 16 (App Router)

---

### Task 1: Create shared YouTube types and loader (`src/lib/youtube.ts`)

**Files:**
- Create: `src/lib/youtube.ts`

**Step 1: Create the shared module**

Create `src/lib/youtube.ts` with the unified type definitions and `loadYouTubeApi()` function. The types are a superset of all 4 components' needs.

```typescript
export type YouTubePlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
};

export type YouTubePlayerEvent = { data: number };

export type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      height: string;
      width: string;
      videoId?: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: number;
    BUFFERING: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
};

type YouTubeWindow = Window & {
  YT?: YouTubeNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is not available on server."));
  }

  const localWindow = window as YouTubeWindow;

  if (localWindow.YT?.Player) {
    return Promise.resolve(localWindow.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    const onReady = () => {
      const latestWindow = window as YouTubeWindow;
      if (latestWindow.YT?.Player) {
        resolve(latestWindow.YT);
      } else {
        reject(new Error("YouTube API failed to initialize."));
      }
    };

    const previousReady = localWindow.onYouTubeIframeAPIReady;
    localWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      onReady();
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load YouTube API script."));
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}
```

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass (new file, no consumers yet)

**Step 3: Commit**

```bash
git add src/lib/youtube.ts
git commit -m "refactor: extract shared YouTube types and loader to src/lib/youtube.ts"
```

---

### Task 2: Create the `useYouTubePlayer` hook (`src/hooks/use-youtube-player.ts`)

**Files:**
- Create: `src/hooks/use-youtube-player.ts`

**Step 1: Create the hook**

Create `src/hooks/use-youtube-player.ts`. This hook encapsulates the imperative child-div mount pattern that was debugged and stabilized (see `progress.md`). It:
- Loads the YouTube API on mount
- Creates an imperative child `<div>` inside the container (avoids React reconciliation issues with YT replacing DOM nodes)
- Creates `new YT.Player()` with caller-provided callbacks
- Uses a ref to hold latest callbacks (avoids stale closures since the effect runs once)
- Cleans up on unmount

```typescript
"use client";

import { useEffect, useRef } from "react";

import {
  loadYouTubeApi,
  type YouTubePlayer,
  type YouTubePlayerEvent,
} from "@/lib/youtube";

export interface UseYouTubePlayerOptions {
  onReady?: () => void;
  onStateChange?: (event: YouTubePlayerEvent) => void;
  onError?: (event: YouTubePlayerEvent) => void;
  playerVars?: Record<string, number>;
}

export interface UseYouTubePlayerReturn {
  playerRef: React.MutableRefObject<YouTubePlayer | null>;
  readyRef: React.MutableRefObject<boolean>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useYouTubePlayer(
  options: UseYouTubePlayerOptions = {},
): UseYouTubePlayerReturn {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest callbacks in a ref so the effect always calls the current version
  // without needing to re-run (which would destroy and recreate the player).
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (!containerRef.current || playerRef.current) {
        return;
      }

      const yt = await loadYouTubeApi();
      if (cancelled || !containerRef.current || playerRef.current) {
        return;
      }

      // Imperative child mount: create a child div for YT.Player to replace.
      // This prevents React reconciliation issues when YT replaces the DOM node.
      if (
        !mountRef.current ||
        mountRef.current.parentNode !== containerRef.current
      ) {
        const mount = document.createElement("div");
        containerRef.current.appendChild(mount);
        mountRef.current = mount;
      }

      playerRef.current = new yt.Player(mountRef.current, {
        height: "0",
        width: "0",
        playerVars: callbacksRef.current.playerVars,
        events: {
          onReady: () => {
            readyRef.current = true;
            callbacksRef.current.onReady?.();
          },
          onStateChange: (event) => {
            callbacksRef.current.onStateChange?.(event);
          },
          onError: (event) => {
            callbacksRef.current.onError?.(event);
          },
        },
      });
    };

    void setup();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      if (mountRef.current?.parentNode) {
        mountRef.current.parentNode.removeChild(mountRef.current);
      }
      mountRef.current = null;
    };
  }, []);

  return { playerRef, readyRef, containerRef };
}
```

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/hooks/use-youtube-player.ts
git commit -m "refactor: add useYouTubePlayer hook for imperative player lifecycle"
```

---

### Task 3: Migrate `audio-engine.tsx` (types + loader only)

**Files:**
- Modify: `src/components/player/audio-engine.tsx`

**Context:** `audio-engine.tsx` has a complex player lifecycle (retry logic, sync polling, volume management) that is too different for the hook. We only replace its local type definitions and `loadYouTubeApi()` with imports from the shared module.

**Step 1: Replace local types and loader with imports**

In `src/components/player/audio-engine.tsx`:

1. Remove the local type definitions (lines 7-49: `YouTubePlayer`, `YouTubeNamespace`, global `Window` declaration)
2. Remove the local `youtubeApiPromise` variable (line 51)
3. Remove the local `loadYouTubeApi()` function (lines 53-95)
4. Add import at the top:

```typescript
import { loadYouTubeApi, type YouTubePlayer, type YouTubeNamespace } from "@/lib/youtube";
```

5. The rest of the file stays unchanged — all the `useEffect` hooks, retry logic, sync intervals, etc. remain as-is.

**Important:** The shared `YouTubePlayer` type is a superset that includes all methods (`playVideo`, `stopVideo`, `seekTo`, `getCurrentTime`, `getDuration`, `setVolume`). The shared `YouTubeNamespace` type includes `PlayerState`. Both are compatible.

**Important:** The `audio-engine.tsx` file uses `declare global { interface Window { ... } }` (lines 44-49) to augment the global Window type. This is NOT needed anymore since the shared module uses a local `YouTubeWindow` type cast. Remove the global declaration.

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/player/audio-engine.tsx
git commit -m "refactor: use shared YouTube types and loader in audio-engine"
```

---

### Task 4: Migrate `quiz-companion-view.tsx` (simplest quiz component)

**Files:**
- Modify: `src/components/quiz-companion-view.tsx`

**Context:** This is the simplest quiz component to migrate. It uses dual players (main + preload) but has no `onStateChange` or `onError` callbacks — only `onReady` for both players. The hook handles `onReady` internally via `readyRef`.

**Step 1: Replace YouTube code with hook usage**

In `src/components/quiz-companion-view.tsx`:

1. Remove all local YouTube type definitions (~lines 44-68)
2. Remove local `youtubeApiPromise` variable (~line 70)
3. Remove local `loadYouTubeApi()` function (~lines 72-118)
4. Add imports:

```typescript
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import type { YouTubePlayer } from "@/lib/youtube";
```

The `YouTubePlayer` type import is needed if the component references it anywhere (e.g., in `waitForYouTubePlayerInstance` or similar functions).

5. Inside the component function, replace the 6 YouTube-related refs:

```typescript
// REMOVE these:
const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
const youtubePreloadContainerRef = useRef<HTMLDivElement | null>(null);
const youtubeMountRef = useRef<HTMLDivElement | null>(null);
const youtubePreloadMountRef = useRef<HTMLDivElement | null>(null);
const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
const youtubePreloadPlayerRef = useRef<YouTubePlayer | null>(null);
const youtubeReadyRef = useRef(false);
const youtubePreloadReadyRef = useRef(false);
```

```typescript
// REPLACE with:
const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };

const mainPlayer = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });
const preloadPlayer = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });
```

6. Remove the entire `useEffect` that sets up YouTube players (~lines 275-380, the large `setupYouTubePlayer` effect). The hook handles all of this now.

7. **Keep** the component-specific cleanup in a separate effect:

```typescript
useEffect(() => {
  return () => {
    clearSnippetTimer();
    stopCompanionAudio();
  };
}, [clearSnippetTimer, stopCompanionAudio]);
```

8. Update all references throughout the component:

| Old | New |
|-----|-----|
| `youtubePlayerRef` | `mainPlayer.playerRef` |
| `youtubePreloadPlayerRef` | `preloadPlayer.playerRef` |
| `youtubeReadyRef` | `mainPlayer.readyRef` |
| `youtubePreloadReadyRef` | `preloadPlayer.readyRef` |
| `youtubeContainerRef` | `mainPlayer.containerRef` |
| `youtubePreloadContainerRef` | `preloadPlayer.containerRef` |
| `preloadedTrackIdRef` | stays as-is (component-specific) |

9. In the JSX, the hidden container divs stay but use the new refs:

```tsx
<div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={mainPlayer.containerRef} />
<div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" ref={preloadPlayer.containerRef} />
```

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/quiz-companion-view.tsx
git commit -m "refactor: use useYouTubePlayer hook in quiz-companion-view"
```

---

### Task 5: Migrate `quiz-play-view.tsx`

**Files:**
- Modify: `src/components/quiz-play-view.tsx`

**Context:** This component is similar to quiz-companion-view but also uses `onStateChange` (to resolve `pendingSnippetStartRef` when video plays) and `onError` (to cancel pending snippet start). These callbacks reference refs, which are always current.

**Step 1: Replace YouTube code with hook usage**

In `src/components/quiz-play-view.tsx`:

1. Remove local YouTube type definitions (~lines 90-118)
2. Remove local `youtubeApiPromise` variable (~line 120)
3. Remove local `loadYouTubeApi()` function (~lines 122-167)
4. Add imports:

```typescript
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import type { YouTubePlayer } from "@/lib/youtube";
```

5. Inside the component function, replace the 8 YouTube-related refs with hook calls. Note: the `onStateChange` and `onError` callbacks must be defined BEFORE the hook call (they reference `pendingSnippetStartRef` and `cancelPendingSnippetStart`):

```typescript
const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };

const mainPlayer = useYouTubePlayer({
  playerVars: QUIZ_PLAYER_VARS,
  onStateChange: (event) => {
    if (event.data === 1) {
      pendingSnippetStartRef.current?.resolve();
      pendingSnippetStartRef.current = null;
    }
  },
  onError: () => {
    cancelPendingSnippetStart("Failed to start snippet playback.");
  },
});
const preloadPlayer = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });
```

**Important:** `pendingSnippetStartRef` and `cancelPendingSnippetStart` must be declared BEFORE the hook calls. Check the component's declaration order and move the hook calls after these declarations if needed.

6. Remove the large `useEffect` that sets up YouTube players (~lines 348-450).

7. **Keep** the component-specific cleanup in a separate effect:

```typescript
useEffect(() => {
  return () => {
    clearTimers();
    stopQuizAudio();
    cancelPendingSnippetStart("Snippet playback cancelled.");
  };
}, [clearTimers, stopQuizAudio, cancelPendingSnippetStart]);
```

8. Update all references (same mapping as Task 4).

9. Update the JSX container divs to use new refs.

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/quiz-play-view.tsx
git commit -m "refactor: use useYouTubePlayer hook in quiz-play-view"
```

---

### Task 6: Migrate `quiz-view.tsx`

**Files:**
- Modify: `src/components/quiz-view.tsx`

**Context:** This is the most complex quiz component (1,724 lines). Same migration pattern as Task 5 but it also has a `clearPreviewTimeout()` cleanup call. Same `onStateChange`/`onError` pattern.

**Step 1: Replace YouTube code with hook usage**

In `src/components/quiz-view.tsx`:

1. Remove local YouTube type definitions (~lines 103-131)
2. Remove local `youtubeApiPromise` variable (~line 133)
3. Remove local `loadYouTubeApi()` function (~lines 135-180)
4. Add imports:

```typescript
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import type { YouTubePlayer } from "@/lib/youtube";
```

5. Replace the 8 YouTube-related refs with hook calls (same as Task 5 but also has `clearPreviewTimeout`):

```typescript
const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };

const mainPlayer = useYouTubePlayer({
  playerVars: QUIZ_PLAYER_VARS,
  onStateChange: (event) => {
    if (event.data === 1) {
      pendingSnippetStartRef.current?.resolve();
      pendingSnippetStartRef.current = null;
    }
  },
  onError: () => {
    cancelPendingSnippetStart("Failed to start snippet playback.");
  },
});
const preloadPlayer = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });
```

6. Remove the large `useEffect` that sets up YouTube players (~lines 464-567).

7. **Keep** the component-specific cleanup in a separate effect:

```typescript
useEffect(() => {
  return () => {
    clearTimers();
    clearPreviewTimeout();
    stopQuizAudio();
    cancelPendingSnippetStart("Snippet playback cancelled.");
  };
}, [clearTimers, clearPreviewTimeout, stopQuizAudio, cancelPendingSnippetStart]);
```

8. Update all references (same mapping as Tasks 4-5).

9. Update the JSX container divs to use new refs.

**Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/components/quiz-view.tsx
git commit -m "refactor: use useYouTubePlayer hook in quiz-view"
```

---

### Task 7: Final verification

**Step 1: Run full lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Pass with zero errors

**Step 2: Verify no remaining duplicated YouTube code**

Search for leftover `loadYouTubeApi` definitions (should only exist in `src/lib/youtube.ts`):

Run: `grep -r "function loadYouTubeApi" src/`
Expected: Only `src/lib/youtube.ts`

Search for leftover `youtubeApiPromise` declarations (should only exist in `src/lib/youtube.ts`):

Run: `grep -r "let youtubeApiPromise" src/`
Expected: Only `src/lib/youtube.ts`

**Step 3: Start dev server and smoke test**

Run: `npm run dev`

Open `http://localhost:3000` and verify:
- Music player works (search + play a track)
- Quiz page loads without errors
- Quiz companion page loads without errors
- Browser console shows no errors
