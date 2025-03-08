import { atom } from "jotai";

export const likesAtom = atom<{
  [key: string]: boolean;
}>({});
