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
  useEffect(() => {
    callbacksRef.current = options;
  });

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
