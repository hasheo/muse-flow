import { create } from "zustand";

import type { Track } from "@/lib/catalog";

export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

type PlayerState = {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackState: PlaybackState;
  playbackError: string | null;
  volume: number;
  progress: number;
  duration: number;
  analyserData: Uint8Array;
  setTracks: (tracks: Track[]) => void;
  setTrack: (track: Track) => void;
  playTrack: (track: Track, queue: Track[]) => void;
  toggle: () => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setPlaybackError: (message: string | null) => void;
  setVolume: (volume: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setAnalyserData: (data: Uint8Array) => void;
  next: () => void;
  previous: () => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  tracks: [],
  currentTrack: null,
  isPlaying: false,
  playbackState: "idle",
  playbackError: null,
  volume: 0.8,
  progress: 0,
  duration: 0,
  analyserData: new Uint8Array(64),
  setTracks: (tracks) =>
    set((state) => ({
      tracks,
      currentTrack: state.currentTrack ?? tracks[0] ?? null,
    })),
  setTrack: (track) =>
    set((state) => ({
      currentTrack: track,
      progress: 0,
      playbackError: null,
      playbackState: state.isPlaying ? "loading" : "paused",
    })),
  playTrack: (track, queue) =>
    set({
      tracks: queue,
      currentTrack: track,
      isPlaying: true,
      progress: 0,
      playbackError: null,
      playbackState: "loading",
    }),
  toggle: () =>
    set((state) => {
      const nextPlaying = !state.isPlaying;
      return {
        isPlaying: nextPlaying,
        playbackError: null,
        playbackState: nextPlaying ? (state.currentTrack ? "loading" : "idle") : state.currentTrack ? "paused" : "idle",
      };
    }),
  setPlaying: (playing) =>
    set((state) => ({
      isPlaying: playing,
      playbackError: playing ? null : state.playbackError,
      playbackState: playing ? (state.currentTrack ? "loading" : "idle") : state.currentTrack ? "paused" : "idle",
    })),
  setPlaybackState: (playbackState) => set({ playbackState }),
  setPlaybackError: (playbackError) => set({ playbackError }),
  setVolume: (volume) => set({ volume }),
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setAnalyserData: (data) => set({ analyserData: data }),
  next: () => {
    const { tracks, currentTrack } = get();
    if (!tracks.length || !currentTrack) {
      return;
    }
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = tracks[(index + 1) % tracks.length];
    set({ currentTrack: nextTrack, progress: 0, isPlaying: true, playbackState: "loading", playbackError: null });
  },
  previous: () => {
    const { tracks, currentTrack } = get();
    if (!tracks.length || !currentTrack) {
      return;
    }
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const previousTrack = tracks[(index - 1 + tracks.length) % tracks.length];
    set({ currentTrack: previousTrack, progress: 0, isPlaying: true, playbackState: "loading", playbackError: null });
  },
}));
