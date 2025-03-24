import { atom } from "jotai";

export const nowPlayingAtom = atom<{
  title: string;
  artist: string;
  artistUri: string;
  songUri: string;
  duration: number;
  progress: number;
  albumArt?: string;
  isPlaying: boolean;
} | null>(null);
