import { atom } from "jotai";

export const profileAtom = atom<{
  avatar: string;
  displayName: string;
  handle: string;
  spotifyUser?: {
    isBeta: boolean;
  };
  spotifyConnected: boolean;
} | null>(null);
