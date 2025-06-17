import { atom } from "jotai";

export const statsAtom = atom<{
  [did: string]: {
    scrobbles: number;
    artists: number;
    lovedTracks: number;
    albums: number;
    tracks: number;
  } | null;
}>({});
