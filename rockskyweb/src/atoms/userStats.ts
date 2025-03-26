import { atom } from "jotai";

export const userStatsAtom = atom<{
  [key: string]: {
    scrobbles: number;
    artists: number;
    lovedTracks: number;
  } | null;
}>({});
