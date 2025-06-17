import { atom } from "jotai";

export const topArtistsAtom = atom<
  {
    id: string;
    name: string;
    picture?: string;
    bio?: string;
    uri: string;
    scrobbles: number | null;
  }[]
>([]);
