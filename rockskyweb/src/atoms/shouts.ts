import { atom } from "jotai";

export const shoutsAtom = atom<{
  [key: string]: {
    uri: string;
    message: string;
    date: string;
    user: {
      avatar: string;
      displayName: string;
      handle: string;
    };
  }[];
}>({});
