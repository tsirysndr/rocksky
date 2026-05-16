import { atom } from 'jotai';

export type Profile = {
  avatar: string;
  displayName: string;
  handle: string;
  did: string;
  spotifyUser?: { isBeta: boolean };
  spotifyConnected?: boolean;
};

export const profileAtom = atom<Profile | null>(null);
