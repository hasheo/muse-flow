type BaseTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
};

export type YouTubeTrack = BaseTrack & {
  sourceType: "youtube";
  youtubeVideoId: string;
};

export type Track = YouTubeTrack;

export const tracks: Track[] = [];
