import { atom } from "jotai";

export const artistAtom = atom<{
  id: string;
  name: string;
  born?: string;
  bornIn?: string;
  died?: string;
  listeners: number;
  scrobbles: number;
  picture?: string;
  tags: string[];
  uri: string;
  spotifyLink?: string;
} | null>(null);
