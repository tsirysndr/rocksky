import { atom } from "jotai";
import type { Shout } from "../api/shouts";

export const shoutsAtom = atom<{ [key: string]: Shout[] }>({});
