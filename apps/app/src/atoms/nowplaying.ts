import { atom } from "jotai";

export const nowPlayingAtom = atom<{
  title: string;
  artist: string;
  cover: string;
  duration: number;
  progress: number;
  isPlaying: boolean;
  liked: boolean;
  uri: string;
} | null>(null);

export const progressAtom = atom(0);

export const playerAtom = atom<"rockbox" | "spotify" | null>(null);

// Timestamp (ms) until which isPlaying updates from polling should be ignored
export const playbackLockedUntilAtom = atom(0);
