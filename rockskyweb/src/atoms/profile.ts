import { atom } from "jotai";

export const profileAtom = atom<{
  avatar: string;
  displayName: string;
  handle: string;
} | null>(null);
