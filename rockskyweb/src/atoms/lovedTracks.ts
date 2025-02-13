import { atom } from "jotai";

export const lovedTracksAtom = atom<
  {
    id: string;
    title: string;
    artist: string;
    albumArtist: string;
    albumArt?: string;
    year: string;
    uri: string;
    scrobbles: number | null;
    albumUri?: string;
    artistUri?: string;
  }[]
>([]);
