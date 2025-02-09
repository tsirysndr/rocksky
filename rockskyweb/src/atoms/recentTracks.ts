import { atom } from "jotai";

export const recentTracksAtom = atom<
  {
    album: string;
    albumArt?: string;
    artist: string;
    albumArtist: string;
    uri: string;
    title: string;
    date: string;
    id: string;
  }[]
>([]);
