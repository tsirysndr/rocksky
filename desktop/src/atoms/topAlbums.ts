import { atom } from "jotai";

export const topAlbumsAtom = atom<
  {
    id: string;
    title: string;
    artist: string;
    albumArt?: string;
    artistUri?: string;
    year: string;
    uri: string;
    scrobbles: number | null;
  }[]
>([]);
