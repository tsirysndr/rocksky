import { atom } from "jotai";

export const profileAtom = atom<{
  avatar: string;
  displayName: string;
  handle: string;
  spotifyUser?: {
    isBeta: boolean;
  };
  spotifyConnected: boolean;
  tidalConnected: boolean;
  lastfmConnected: boolean;
  googledriveUser?: {
    isBeta: boolean;
  };
  dropboxUser?: {
    isBeta: boolean;
  };
  did: string;
} | null>(null);
