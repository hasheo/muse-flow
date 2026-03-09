"use client";

import { useCallback, useEffect, useRef } from "react";

import { usePlayerStore } from "@/store/player-store";
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube";

export function AudioEngine() {
  const MAX_RETRY_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 900;

  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeReadyRef = useRef(false);
  const youtubeSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const retryTrackKeyRef = useRef<string>("");

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const setPlaybackState = usePlayerStore((state) => state.setPlaybackState);
  const progress = usePlayerStore((state) => state.progress);
  const setAnalyserData = usePlayerStore((state) => state.setAnalyserData);

  const clearYoutubeSync = useCallback(() => {
    if (youtubeSyncRef.current) {
      clearInterval(youtubeSyncRef.current);
      youtubeSyncRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const resetRetryState = useCallback(
    (trackKey?: string) => {
      clearRetryTimer();
      retryAttemptRef.current = 0;
      if (trackKey) {
        retryTrackKeyRef.current = trackKey;
      }
    },
    [clearRetryTimer],
  );

  const scheduleRetry = useCallback(
    (trackKey: string, retryFn: () => void) => {
      if (!trackKey) {
        return false;
      }

      if (retryTrackKeyRef.current !== trackKey) {
        retryTrackKeyRef.current = trackKey;
        retryAttemptRef.current = 0;
      }

      if (retryAttemptRef.current >= MAX_RETRY_ATTEMPTS) {
        return false;
      }

      retryAttemptRef.current += 1;
      clearRetryTimer();
      retryTimeoutRef.current = setTimeout(() => {
        retryFn();
      }, RETRY_DELAY_MS);

      return true;
    },
    [MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS, clearRetryTimer],
  );

  const startYoutubeSync = useCallback(() => {
    const player = youtubePlayerRef.current;
    if (!player) {
      return;
    }

    clearYoutubeSync();
    youtubeSyncRef.current = setInterval(() => {
      const store = usePlayerStore.getState();
      const durationValue = player.getDuration();
      const progressValue = player.getCurrentTime();
      if (Number.isFinite(durationValue)) {
        store.setDuration(durationValue);
      }
      if (Number.isFinite(progressValue)) {
        store.setProgress(progressValue);
      }
    }, 250);
  }, [clearYoutubeSync]);

  useEffect(() => {
    if (youtubePlayerRef.current && youtubeReadyRef.current) {
      youtubePlayerRef.current.setVolume(Math.round(volume * 100));
    }
  }, [volume]);

  useEffect(() => {
    let cancelled = false;

    const setupPlayer = async () => {
      if (!youtubeContainerRef.current || youtubePlayerRef.current) {
        return;
      }

      const yt = await loadYouTubeApi();
      if (cancelled || !youtubeContainerRef.current || youtubePlayerRef.current) {
        return;
      }

      youtubePlayerRef.current = new yt.Player(youtubeContainerRef.current, {
        height: "0",
        width: "0",
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            youtubeReadyRef.current = true;
            const store = usePlayerStore.getState();
            const player = youtubePlayerRef.current;

            player?.setVolume(Math.round(store.volume * 100));

            if (store.currentTrack && player) {
              resetRetryState(`youtube:${store.currentTrack.id}`);
              if (store.isPlaying) {
                store.setPlaybackState("loading");
                player.loadVideoById(store.currentTrack.youtubeVideoId);
                startYoutubeSync();
              } else {
                store.setPlaybackState("paused");
                player.cueVideoById(store.currentTrack.youtubeVideoId);
              }
            }
          },
          onStateChange: (event) => {
            const store = usePlayerStore.getState();

            if (event.data === yt.PlayerState.PLAYING) {
              store.setPlaying(true);
              store.setPlaybackState("playing");
              store.setPlaybackError(null);
              resetRetryState();
              startYoutubeSync();
              return;
            }

            if (event.data === yt.PlayerState.PAUSED) {
              store.setPlaying(false);
              store.setPlaybackState(store.currentTrack ? "paused" : "idle");
              clearYoutubeSync();
              return;
            }

            if (event.data === yt.PlayerState.BUFFERING || event.data === yt.PlayerState.UNSTARTED) {
              if (store.currentTrack) {
                store.setPlaybackState("loading");
              }
              return;
            }

            if (event.data === yt.PlayerState.ENDED) {
              store.setPlaying(false);
              store.setPlaybackState("paused");
              clearYoutubeSync();
              store.next();
            }
          },
          onError: () => {
            const store = usePlayerStore.getState();
            const track = store.currentTrack;
            const player = youtubePlayerRef.current;

            if (!track || !player) {
              return;
            }

            const trackKey = `youtube:${track.id}`;
            const didSchedule = scheduleRetry(trackKey, () => {
              if (!usePlayerStore.getState().isPlaying) {
                return;
              }
              usePlayerStore.getState().setPlaybackState("loading");
              player.loadVideoById(track.youtubeVideoId);
              startYoutubeSync();
            });

            if (!didSchedule) {
              store.setPlaying(false);
              store.setPlaybackState("error");
              store.setPlaybackError("Failed to play YouTube stream. Try playing again.");
              clearYoutubeSync();
            } else {
              store.setPlaybackState("loading");
              store.setPlaybackError("Connection interrupted, retrying playback...");
            }
          },
        },
      });
    };

    void setupPlayer();

    return () => {
      cancelled = true;
      clearYoutubeSync();
      clearRetryTimer();
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
      youtubeReadyRef.current = false;
    };
  }, [clearRetryTimer, clearYoutubeSync, resetRetryState, scheduleRetry, startYoutubeSync]);

  useEffect(() => {
    const youtubePlayer = youtubePlayerRef.current;
    const store = usePlayerStore.getState();

    if (!currentTrack) {
      resetRetryState();
      clearYoutubeSync();
      youtubePlayer?.stopVideo();
      store.setPlaybackState("idle");
      store.setPlaybackError(null);
      return;
    }

    const trackKey = `youtube:${currentTrack.id}`;
    resetRetryState(trackKey);
    store.setPlaybackError(null);
    setAnalyserData(new Uint8Array(64));
    if (!youtubePlayer || !youtubeReadyRef.current) {
      if (store.isPlaying) {
        store.setPlaybackState("loading");
      }
      return;
    }

    if (store.isPlaying) {
      store.setPlaybackState("loading");
      youtubePlayer.loadVideoById(currentTrack.youtubeVideoId);
      startYoutubeSync();
    } else {
      store.setPlaybackState("paused");
      youtubePlayer.cueVideoById(currentTrack.youtubeVideoId);
    }
  }, [clearYoutubeSync, currentTrack, resetRetryState, setAnalyserData, startYoutubeSync]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    if (!youtubePlayerRef.current || !youtubeReadyRef.current) {
      if (isPlaying) {
        setPlaybackState("loading");
      }
      return;
    }

    if (isPlaying) {
      setPlaybackState("loading");
      youtubePlayerRef.current.playVideo();
      startYoutubeSync();
    } else {
      youtubePlayerRef.current.pauseVideo();
      clearYoutubeSync();
      setPlaybackState("paused");
    }
  }, [
    clearYoutubeSync,
    currentTrack,
    isPlaying,
    setPlaybackState,
    startYoutubeSync,
  ]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    const player = youtubePlayerRef.current;
    if (!player || !youtubeReadyRef.current) {
      return;
    }

    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - progress) > 1) {
      player.seekTo(progress, true);
    }
  }, [currentTrack, progress]);

  return (
    <>
      <div aria-hidden className="hidden" ref={youtubeContainerRef} />
    </>
  );
}
