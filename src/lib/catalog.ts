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

export const tracks: Track[] = [
  {
    id: "yt-jazz-vibes-1",
    sourceType: "youtube",
    youtubeVideoId: "Dx5qFachd3A",
    title: "Jazz in Paris",
    artist: "Media Right Productions",
    album: "YouTube Audio Library",
    duration: 185,
    cover: "https://i.ytimg.com/vi/Dx5qFachd3A/hqdefault.jpg",
  },
  {
    id: "yt-lofi-1",
    sourceType: "youtube",
    youtubeVideoId: "5qap5aO4i9A",
    title: "lofi hip hop radio",
    artist: "Lofi Girl",
    album: "Live Stream",
    duration: 0,
    cover: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
  },
  {
    id: "yt-instrumental-1",
    sourceType: "youtube",
    youtubeVideoId: "hHW1oY26kxQ",
    title: "A New Beginning",
    artist: "Bensound",
    album: "Royalty Free Music",
    duration: 142,
    cover: "https://i.ytimg.com/vi/hHW1oY26kxQ/hqdefault.jpg",
  },
];
