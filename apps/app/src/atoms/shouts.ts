import { atom } from "jotai";

export const shoutsAtom = atom<{
  [key: string]: {
    id: string;
    uri: string;
    message: string;
    date: string;
    liked: boolean;
    reported: boolean;
    likes: number;
    user: {
      did: string;
      avatar: string;
      displayName: string;
      handle: string;
    };
    replies: {
      id: string;
      uri: string;
      message: string;
      date: string;
      liked: boolean;
      reported: boolean;
      likes: number;
      user: {
        did: string;
        avatar: string;
        displayName: string;
        handle: string;
      };
    }[];
  }[];
}>({});
