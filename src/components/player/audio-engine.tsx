"use client";

import { useEffect, useRef } from "react";

import { usePlayerStore } from "@/store/player-store";
import { type YouTubePlayerEvent } from "@/lib/youtube";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { usePlayerSync } from "@/hooks/use-player-sync";
import { usePlayerRetry } from "@/hooks/use-player-retry";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";

export function AudioEngine() {
  const trackLoadedRef = useRef(false);
  const forcePlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const progress = usePlayerStore((s) => s.progress);
  const playbackState = usePlayerStore((s) => s.playbackState);

  // --- Extracted hooks ---

  const { playerRef, readyRef, containerRef } = useYouTubePlayer({
    onReady: handleReady,
    onStateChange: handleStateChange,
    onError: handleError,
    playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0 },
  });

  const { startSync, stopSync } = usePlayerSync(playerRef, {
    setProgress: (s: number) => usePlayerStore.getState().setProgress(s),
    setDuration: (s: number) => usePlayerStore.getState().setDuration(s),
  });

  const { scheduleRetry, resetRetry } = usePlayerRetry({
    onRetriesExhausted: () => {
      // Handled inline at the call site in handleError
    },
  });

  useLoadingTimeout(playbackState, {
    onStuck: handleLoadingStuck,
  });

  // --- Callbacks ---

  function handleReady() {
    const store = usePlayerStore.getState();
    const player = playerRef.current;

    player?.setVolume(Math.round(store.volume * 100));

    if (store.currentTrack && player) {
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
  }

  function handleStateChange(event: YouTubePlayerEvent) {
    const store = usePlayerStore.getState();

    // PLAYING (1)
    if (event.data === 1) {
      store.setPlaying(true);
      store.setPlaybackState("playing");
      store.setPlaybackError(null);
      resetRetry();
      startSync();
      return;
    }

    // PAUSED (2)
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
  }

  function handleError() {
    const store = usePlayerStore.getState();
    const track = store.currentTrack;
    const player = playerRef.current;

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
      startSync();
    });

    if (!didSchedule) {
      store.setPlaying(false);
      store.setPlaybackState("error");
      store.setPlaybackError(
        "Failed to play YouTube stream. Try playing again.",
      );
      stopSync();
    } else {
      store.setPlaybackState("loading");
      store.setPlaybackError("Connection interrupted, retrying playback...");
    }
  }

  function handleLoadingStuck() {
    const store = usePlayerStore.getState();
    const player = playerRef.current;
    if (!player || !store.isPlaying || !store.currentTrack) return;

    player.loadVideoById(store.currentTrack.youtubeVideoId);

    forcePlayTimeoutRef.current = setTimeout(() => {
      const s = usePlayerStore.getState();
      if (s.isPlaying && s.playbackState !== "playing" && playerRef.current) {
        playerRef.current.playVideo();
      }
    }, 1500);
  }

  // --- Effects ---

  // Volume changes
  useEffect(() => {
    if (playerRef.current && readyRef.current) {
      playerRef.current.setVolume(Math.round(volume * 100));
    }
  }, [volume, playerRef, readyRef]);

  // Track changes
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

  // Play/pause toggle
  useEffect(() => {
    if (trackLoadedRef.current) {
      trackLoadedRef.current = false;
      return;
    }

    if (!currentTrack) {
      return;
    }

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

  // Seek detection
  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    const player = playerRef.current;
    if (!player || !readyRef.current) {
      return;
    }

    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - progress) > 1) {
      player.seekTo(progress, true);
    }
  }, [currentTrack, progress, playerRef, readyRef]);

  // Cleanup force-play timeout on unmount
  useEffect(() => {
    return () => {
      if (forcePlayTimeoutRef.current) {
        clearTimeout(forcePlayTimeoutRef.current);
      }
    };
  }, []);

  return <div aria-hidden className="hidden" ref={containerRef} />;
}
