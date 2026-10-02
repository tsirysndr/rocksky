import { atom } from "jotai";
import type { Story } from "../types/feed";

// Hand-off between the Home stories row and the Story viewer screen.
export const storiesAtom = atom<Story[]>([]);
