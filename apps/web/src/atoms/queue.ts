import { atom } from "jotai";

export const queueAtom = atom<
  {
    id: string;
    artist: string;
    album: string;
    title: string;
    albumArt?: string;
    url: string;
    duration: number;
  }[]
>([]);
