import { atom } from "jotai";

export const nowPlayingAtom = atom<{
  title: string;
  artist: string;
  cover: string;
  duration: number;
  progress: number;
} | null>(null);

export const progressAtom = atom(0);
