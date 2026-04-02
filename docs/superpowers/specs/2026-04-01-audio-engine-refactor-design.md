# AudioEngine Refactor Design

## Context

`src/components/player/audio-engine.tsx` is a 349-line component managing YouTube player lifecycle, playback state sync, error handling, and retry logic. It has 8 refs, 5 effects, and interleaved concerns that make it difficult to understand, test, and modify. There are known race conditions:

- Retry timeout can fire for a stale track if the user changes tracks mid-retry
- Loading timeout doesn't reset on track change, potentially force-reloading the wrong video
- Player callbacks can fire after unmount during initialization

## Approach

**Hook-per-concern:** Split into 4 focused hooks, each owning one responsibility. `AudioEngine` becomes a thin orchestrator (~60 lines) that reads/writes the Zustand store and wires hooks together.

Goals:
- Improve maintainability by isolating concerns
- Fix known race conditions while we're in there
- Keep hooks testable without mocking the store (callbacks/params, not direct store access)

## Architecture

```
AudioEngine (orchestrator, ~60 lines)
  +-- useYouTubePlayer(containerRef, callbacks)
  |     -> { playerRef, isReady, loadVideo, cueVideo, play, pause, seekTo, setVolume }
  |
  +-- usePlayerSync(playerRef, isReady, callbacks)
  |     -> { startSync, stopSync }
  |
  +-- usePlayerRetry(options)
  |     -> { scheduleRetry, resetRetry, isRetrying }
  |
  +-- useLoadingTimeout(playerRef, playbackState, callbacks, options?)
        -> void (self-contained effect)
```

The player ref flows downward from `useYouTubePlayer`. Other hooks receive it as a parameter. Only `AudioEngine` interacts with the Zustand store.

## Hook Specifications

### useYouTubePlayer

**File:** `src/hooks/use-youtube-player.ts`

**Responsibility:** Create/destroy the YouTube IFrame player, expose a stable API.

**Interface:**

```ts
type UseYouTubePlayerOptions = {
  onReady: () => void;
  onStateChange: (state: number) => void;
  onError: (errorCode: number) => void;
};

function useYouTubePlayer(
  containerRef: RefObject<HTMLDivElement>,
  options: UseYouTubePlayerOptions
): {
  playerRef: RefObject<YT.Player | null>;
  isReady: boolean;
  loadVideo: (videoId: string) => void;
  cueVideo: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
};
```

**Internals:**

- Single effect: creates player on mount, destroys on unmount
- `isReady` state replaces the old `youtubeReadyRef` — set true in `onReady`, reset on destroy
- `loadVideo`/`cueVideo` guard against `!isReady` (no-op instead of crash)
- Callbacks stored in refs to avoid re-creating the player when handlers change
- `mountedRef` guard: checked before invoking any callback, prevents post-unmount fires

**Race condition fix:** If the component unmounts mid-initialization, the player might fire `onReady` after cleanup. The `mountedRef` check prevents this.

### usePlayerSync

**File:** `src/hooks/use-player-sync.ts`

**Responsibility:** Poll the YouTube player every 250ms for progress/duration, push values via callbacks.

**Interface:**

```ts
function usePlayerSync(
  playerRef: RefObject<YT.Player | null>,
  isReady: boolean,
  callbacks: {
    setProgress: (seconds: number) => void;
    setDuration: (seconds: number) => void;
  }
): {
  startSync: () => void;
  stopSync: () => void;
};
```

**Internals:**

- Owns one `intervalRef`
- `startSync`: clears existing interval, starts new 250ms poll
- `stopSync`: clears interval
- Auto-cleanup on unmount
- Guards: if `!isReady` or `!playerRef.current`, skip the poll tick (don't stop the interval since the player may become ready mid-poll)

This is a clean extraction with no behavioral changes from the current implementation.

### usePlayerRetry

**File:** `src/hooks/use-player-retry.ts`

**Responsibility:** Track retry attempts per track, schedule retries with delay, reset on track change.

**Interface:**

```ts
type UsePlayerRetryOptions = {
  maxAttempts?: number;   // default 2
  delayMs?: number;       // default 900
  onRetriesExhausted: (trackKey: string) => void;
};

function usePlayerRetry(
  options: UsePlayerRetryOptions
): {
  scheduleRetry: (trackKey: string, retryFn: () => void) => void;
  resetRetry: () => void;
  isRetrying: boolean;
};
```

**Internals:**

- Owns: `attemptRef`, `trackKeyRef`, `timeoutRef`
- `scheduleRetry(trackKey, retryFn)`:
  - If different track than last retry: reset counter, update trackKeyRef
  - If attempts < max: increment, setTimeout with retryFn
  - Before executing retryFn: re-check trackKey matches (stale guard)
  - If exhausted: call `onRetriesExhausted`
- `resetRetry()`: clear timeout, reset counter to 0
- Auto-cleanup on unmount

**Race condition fix:** Currently, if a new track loads while a retry timeout is pending, the old retry fires for the wrong track. The stale track key check inside the timeout callback prevents this.

### useLoadingTimeout

**File:** `src/hooks/use-loading-timeout.ts`

**Responsibility:** Detect when the player is stuck in "loading" state, trigger recovery.

**Interface:**

```ts
function useLoadingTimeout(
  playerRef: RefObject<YT.Player | null>,
  playbackState: PlaybackState,
  callbacks: {
    onStuck: () => void;
  },
  options?: {
    timeoutMs?: number;  // default 4000
  }
): void;
```

**Internals:**

- Effect watches `playbackState`
- When state becomes `"loading"`: start timeout
- When state changes to anything else: clear timeout
- On timeout: call `onStuck` (the orchestrator decides recovery action)
- Auto-cleanup on unmount and state transitions

**Recovery sequence:** When `onStuck` fires, the orchestrator calls `loadVideo()` to force-reload. The current code also waits 1.5s after force-reload before calling `play()`. This secondary delay should live in the orchestrator's `onStuck` handler (setTimeout 1.5s -> play), not inside the hook.

**Race condition fix:** Currently the loading timeout doesn't clear when the track changes. By depending on `playbackState` (which transitions to `"loading"` on each track change), the timeout auto-resets.

## AudioEngine Orchestrator

**File:** `src/components/player/audio-engine.tsx` (rewritten)

**Responsibility:** Wire hooks together, read/write Zustand store, render hidden container.

**Shape (~60 lines):**

```tsx
function AudioEngine() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store reads
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const volume = usePlayerStore(s => s.volume);
  const progress = usePlayerStore(s => s.progress);
  const playbackState = usePlayerStore(s => s.playbackState);

  // Store writes
  const setPlaybackState = usePlayerStore(s => s.setPlaybackState);
  const setPlaying = usePlayerStore(s => s.setPlaying);
  const setDuration = usePlayerStore(s => s.setDuration);
  const setProgress = usePlayerStore(s => s.setProgress);
  const setPlaybackError = usePlayerStore(s => s.setPlaybackError);
  const setAnalyserData = usePlayerStore(s => s.setAnalyserData);

  // Hooks
  const { playerRef, isReady, loadVideo, play, pause, seekTo, setVolume: setPlayerVolume } =
    useYouTubePlayer(containerRef, {
      onReady: () => { /* load current track if exists */ },
      onStateChange: (state) => { /* map YT states to store, start/stop sync */ },
      onError: () => { scheduleRetry(...) },
    });

  const { startSync, stopSync } = usePlayerSync(playerRef, isReady, {
    setProgress, setDuration,
  });

  const { scheduleRetry, resetRetry } = usePlayerRetry({
    onRetriesExhausted: () => {
      setPlaybackState("error");
      setPlaybackError("Failed to play this track.");
    },
  });

  useLoadingTimeout(playerRef, playbackState, {
    onStuck: () => { loadVideo(currentTrack.youtubeVideoId); },
  });

  // Remaining effects (each 5-10 lines):
  // 1. Track change -> loadVideo, resetRetry
  // 2. isPlaying change -> play/pause, startSync/stopSync
  // 3. Volume change -> setPlayerVolume
  // 4. Seek detection -> seekTo (when progress drifts >1s)

  return <div ref={containerRef} className="hidden" />;
}
```

## Error Handling Matrix

| Scenario | Current Behavior | After Refactor |
|----------|-----------------|----------------|
| Player error (code 150, etc.) | Retry via refs + timeout | `usePlayerRetry.scheduleRetry()` with track key validation |
| Stuck loading >4s | Timeout fires, force reload | `useLoadingTimeout` effect, auto-clears on state/track change |
| Retry fires for wrong track | Can happen (race condition) | Track key check in `scheduleRetry` prevents stale execution |
| Unmount during init | Player may fire callbacks post-destroy | `mountedRef` guard in `useYouTubePlayer` |
| Track change during retry | Old retry timeout may execute | `scheduleRetry` detects stale track key, no-ops |

## File Changes

| File | Action |
|------|--------|
| `src/hooks/use-youtube-player.ts` | New |
| `src/hooks/use-player-sync.ts` | New |
| `src/hooks/use-player-retry.ts` | New |
| `src/hooks/use-loading-timeout.ts` | New |
| `src/components/player/audio-engine.tsx` | Rewrite (349 -> ~60 lines) |

## Testing Notes

Each hook can be tested independently:

- `useYouTubePlayer`: mock the YT.Player constructor, verify lifecycle
- `usePlayerSync`: provide a mock playerRef, verify interval behavior
- `usePlayerRetry`: call scheduleRetry with different track keys, verify attempt counting and stale guards
- `useLoadingTimeout`: set playbackState to "loading", verify timeout fires; change state, verify it clears

## Out of Scope

- Changing the YouTube IFrame API to a different player library
- Making the player source-agnostic (Spotify, SoundCloud, etc.)
- Adding new playback features (queue management, shuffle, repeat)
- Modifying the Zustand store shape
