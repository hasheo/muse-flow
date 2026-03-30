import { useCallback, useRef } from "react";

import type { Track } from "@/lib/catalog";
import type { UseQuizTimersReturn } from "@/hooks/use-quiz-timers";
import type { UseQuizPlayersReturn } from "@/hooks/use-quiz-players";

export interface UseQuizSnippetPlaybackOptions {
  mainPlayerRef: UseQuizPlayersReturn["mainPlayerRef"];
  preloadPlayerRef: UseQuizPlayersReturn["preloadPlayerRef"];
  preloadReadyRef: UseQuizPlayersReturn["preloadReadyRef"];
  pendingSnippetStartRef: UseQuizTimersReturn["pendingSnippetStartRef"];
  cancelPendingSnippetStart: UseQuizTimersReturn["cancelPendingSnippetStart"];
}

export interface UseQuizSnippetPlaybackReturn {
  waitForYouTubePlayerInstance: (timeoutMs?: number) => Promise<void>;
  playSnippet: (track: Track, startAt: number) => Promise<void>;
  preloadTrackMetadata: (track: Track | null) => void;
  preloadedTrackIdRef: React.MutableRefObject<string | null>;
}

export function useQuizSnippetPlayback({
  mainPlayerRef,
  preloadPlayerRef,
  preloadReadyRef,
  pendingSnippetStartRef,
  cancelPendingSnippetStart,
}: UseQuizSnippetPlaybackOptions): UseQuizSnippetPlaybackReturn {
  const preloadedTrackIdRef = useRef<string | null>(null);

  const waitForYouTubePlayerInstance = useCallback(
    (timeoutMs = 20000) => {
      return new Promise<void>((resolve, reject) => {
        if (mainPlayerRef.current) {
          resolve();
          return;
        }

        const start = Date.now();
        const intervalId = window.setInterval(() => {
          if (mainPlayerRef.current) {
            window.clearInterval(intervalId);
            resolve();
            return;
          }

          if (Date.now() - start >= timeoutMs) {
            window.clearInterval(intervalId);
            reject(new Error("YouTube player is not ready yet."));
          }
        }, 50);
      });
    },
    [mainPlayerRef],
  );

  const playSnippet = useCallback(
    async (track: Track, startAt: number) => {
      await waitForYouTubePlayerInstance();
      let lastError: unknown;

      for (let attempt = 0; attempt < 200; attempt += 1) {
        const player = mainPlayerRef.current;
        if (!player) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
          continue;
        }

        try {
          cancelPendingSnippetStart("Restarting snippet playback.");
          const playbackStarted = new Promise<void>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
              if (pendingSnippetStartRef.current === marker) {
                pendingSnippetStartRef.current = null;
              }
              reject(new Error("Snippet took too long to start."));
            }, 8000);

            const marker = {
              reject: (error: Error) => {
                window.clearTimeout(timeoutId);
                if (pendingSnippetStartRef.current === marker) {
                  pendingSnippetStartRef.current = null;
                }
                reject(error);
              },
              resolve: () => {
                window.clearTimeout(timeoutId);
                if (pendingSnippetStartRef.current === marker) {
                  pendingSnippetStartRef.current = null;
                }
                resolve();
              },
            };

            pendingSnippetStartRef.current = marker;
          });

          player.loadVideoById(track.youtubeVideoId, startAt);
          await playbackStarted;
          return;
        } catch (error) {
          lastError = error;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
        }
      }

      if (lastError instanceof Error) {
        throw new Error(lastError.message);
      }
      throw new Error("YouTube player is not ready yet.");
    },
    [cancelPendingSnippetStart, mainPlayerRef, waitForYouTubePlayerInstance, pendingSnippetStartRef],
  );

  const preloadTrackMetadata = useCallback(
    (track: Track | null) => {
      if (!track) {
        return;
      }
      if (preloadedTrackIdRef.current === track.id) {
        return;
      }
      preloadedTrackIdRef.current = track.id;

      if (!preloadPlayerRef.current || !preloadReadyRef.current) {
        return;
      }
      if (preloadPlayerRef.current.cueVideoById) {
        preloadPlayerRef.current.cueVideoById(track.youtubeVideoId, 0);
        return;
      }
      preloadPlayerRef.current.loadVideoById(track.youtubeVideoId, 0);
      preloadPlayerRef.current.pauseVideo();
    },
    [preloadPlayerRef, preloadReadyRef],
  );

  return {
    waitForYouTubePlayerInstance,
    playSnippet,
    preloadTrackMetadata,
    preloadedTrackIdRef,
  };
}
