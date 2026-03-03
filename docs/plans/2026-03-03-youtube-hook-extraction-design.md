# YouTube Hook Extraction Design

Date: 2026-03-03
Status: Approved

## Goal

Extract ~400-500 lines of duplicated YouTube IFrame API code from 4 components into a shared module and reusable hook.

## Context

The YouTube player initialization pattern is duplicated across:
- `quiz-view.tsx` (1,724 lines) — types + loader + dual player setup
- `quiz-play-view.tsx` (1,026 lines) — types + loader + dual player setup
- `quiz-companion-view.tsx` (702 lines) — types + loader + dual player setup
- `audio-engine.tsx` (400 lines) — types + loader + single player with complex lifecycle

Each file has ~45-50 lines of identical `loadYouTubeApi()`, ~30 lines of identical type definitions, and ~80-150 lines of similar player setup/cleanup patterns.

## Design

### 1. `src/lib/youtube.ts` — Shared Types & Loader

Contains:
- **Types**: `YouTubePlayer` (unified superset), `YouTubePlayerEvent`, `YouTubeNamespace`, `YouTubeWindow`
- **`loadYouTubeApi()`**: Shared API loader with promise caching
- **Module-level cache**: `youtubeApiPromise` variable

Pure TypeScript, no React dependencies.

### 2. `src/hooks/use-youtube-player.ts` — Reusable Hook

```typescript
interface UseYouTubePlayerOptions {
  onReady?: () => void;
  onStateChange?: (event: YouTubePlayerEvent) => void;
  onError?: (event: YouTubePlayerEvent) => void;
  playerVars?: Record<string, unknown>;
}

interface UseYouTubePlayerReturn {
  playerRef: MutableRefObject<YouTubePlayer | null>;
  isReady: boolean;
  mountRef: RefCallback<HTMLDivElement>;
}
```

The hook handles:
1. `loadYouTubeApi()` call on mount
2. Imperative child div creation inside mount target
3. `new YT.Player()` creation with provided callbacks
4. Readiness tracking (ref + state)
5. Cleanup on unmount (destroy player, remove child div)

### 3. Migration

| File | Change | Lines Removed |
|------|--------|---------------|
| quiz-view.tsx | Use hook x2 (main + preload) | ~150 |
| quiz-play-view.tsx | Use hook x2 (main + preload) | ~150 |
| quiz-companion-view.tsx | Use hook x2 (main + preload) | ~120 |
| audio-engine.tsx | Import types + loader only | ~80 |

**audio-engine.tsx does NOT use the hook** — its player lifecycle has retry logic, sync polling, and volume management that are too different.

### 4. What Stays Unchanged

- All quiz logic, state management, UI rendering
- Component-specific callbacks (onStateChange handlers)
- `playSnippet()`, `preloadTrackMetadata()`, quiz flow functions
- No functional behavior changes — pure refactor

## Decisions

- **Hook per player instance** — each component creates 1-2 hook instances (main + preload). Simple, composable.
- **audio-engine excluded from hook** — its lifecycle is fundamentally different. Gets shared types + loader only.
- **Imperative child mount pattern preserved** — this was a hard-won fix (see progress.md). The hook encapsulates it.

## Files to Create/Modify

1. Create: `src/lib/youtube.ts`
2. Create: `src/hooks/use-youtube-player.ts`
3. Modify: `src/components/quiz-view.tsx`
4. Modify: `src/components/quiz-play-view.tsx`
5. Modify: `src/components/quiz-companion-view.tsx`
6. Modify: `src/components/player/audio-engine.tsx`
