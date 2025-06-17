import { atom } from "jotai";

export const statsAtom = atom<{
  scrobbles: number;
  artists: number;
  lovedTracks: number;
} | null>(null);
