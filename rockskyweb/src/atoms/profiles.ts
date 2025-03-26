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
    googledriveUser?: {
      isBeta: boolean;
    };
    dropboxUser?: {
      isBeta: boolean;
    };
    did: string;
    createdAt: string;
  } | null;
}>({});
