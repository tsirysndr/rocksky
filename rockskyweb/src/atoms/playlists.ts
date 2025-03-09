import { atom } from "jotai";

export const playlistsAtom = atom<
  {
    id: string;
    name: string;
    picture: string;
    description?: string;
    uri?: string;
    spotifyLink?: string;
    tidalLink?: string;
    appleMusicLink?: string;
    trackCount: number;
  }[]
>([]);
