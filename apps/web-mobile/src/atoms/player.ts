import { atom } from "jotai";

export const playerAtom = atom<"rockbox" | "spotify" | null>(null);
