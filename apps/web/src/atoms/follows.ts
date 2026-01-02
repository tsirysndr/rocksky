import { atom } from "jotai";

export const followsAtom = atom<{
  [key: string]: string[] | null;
}>({});
