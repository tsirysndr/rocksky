import { atom } from "jotai";

export const userNowPlayingAtom = atom<{
  [key: string]: {
    title: string;
    artist: string;
    artistUri: string;
    songUri: string;
    albumUri: string;
    duration: number;
    progress: number;
    albumArt?: string;
    isPlaying: boolean;
  } | null;
}>({});
