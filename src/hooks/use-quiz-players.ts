import { useCallback } from "react";

import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import type { UseQuizTimersReturn } from "@/hooks/use-quiz-timers";

const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 };

export interface UseQuizPlayersOptions {
  pendingSnippetStartRef: UseQuizTimersReturn["pendingSnippetStartRef"];
  cancelPendingSnippetStart: UseQuizTimersReturn["cancelPendingSnippetStart"];
}

export interface UseQuizPlayersReturn {
  mainPlayerRef: ReturnType<typeof useYouTubePlayer>["playerRef"];
  mainContainerRef: ReturnType<typeof useYouTubePlayer>["containerRef"];
  preloadPlayerRef: ReturnType<typeof useYouTubePlayer>["playerRef"];
  preloadReadyRef: ReturnType<typeof useYouTubePlayer>["readyRef"];
  preloadContainerRef: ReturnType<typeof useYouTubePlayer>["containerRef"];
  stopQuizAudio: () => void;
}

export function useQuizPlayers({
  pendingSnippetStartRef,
  cancelPendingSnippetStart,
}: UseQuizPlayersOptions): UseQuizPlayersReturn {
  const { playerRef: mainPlayerRef, containerRef: mainContainerRef } = useYouTubePlayer({
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

  const {
    playerRef: preloadPlayerRef,
    readyRef: preloadReadyRef,
    containerRef: preloadContainerRef,
  } = useYouTubePlayer({ playerVars: QUIZ_PLAYER_VARS });

  const stopQuizAudio = useCallback(() => {
    mainPlayerRef.current?.pauseVideo();
  }, [mainPlayerRef]);

  return {
    mainPlayerRef,
    mainContainerRef,
    preloadPlayerRef,
    preloadReadyRef,
    preloadContainerRef,
    stopQuizAudio,
  };
}
