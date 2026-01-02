import { atom } from "jotai";

export const followsAtom = atom<Set<string>>(new Set<string>());
