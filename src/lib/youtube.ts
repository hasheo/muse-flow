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
