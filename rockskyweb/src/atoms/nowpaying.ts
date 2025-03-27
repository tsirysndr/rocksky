import { atom } from "jotai";

export const nowPlayingAtom = atom<{
  title: string;
  artist: string;
  artistUri: string;
  songUri: string;
  albumUri: string;
  duration: number;
  progress: number;
  albumArt?: string;
  isPlaying: boolean;
  liked: boolean;
  sha256: string;
} | null>(null);
