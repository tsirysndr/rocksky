import { atom } from "jotai";

export const recentTracksAtom = atom<
  {
    album: string;
    albumArt?: string;
    artist: string;
    albumArtist: string;
    albumUri: string;
    artistUri: string;
    uri: string;
    title: string;
    date: string;
    id: string;
  }[]
>([]);
