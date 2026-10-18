import { atom } from "jotai";

export const profilesAtom = atom<{
  [key: string]: {
    avatar: string;
    displayName: string;
    handle: string;
    spotifyUser?: {
      isBeta: boolean;
    };
    spotifyConnected: boolean;
    did: string;
    createdAt: string;
  } | null;
}>({});
