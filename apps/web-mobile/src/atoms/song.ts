import { atom } from "jotai";

export const songAtom = atom<{
  title: string;
  albumArtist: string;
  cover: string;
  listeners: number;
  scrobbles: number;
  tags: string[];
  lyrics?: string;
  artistUri?: string;
  albumUri?: string;
  spotifyLink?: string;
} | null>(null);
