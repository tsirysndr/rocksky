import { atom } from "jotai";

// Reactive mirror of the stored session: lets screens and queries react to
// sign-in/sign-out without re-reading AsyncStorage.
export const authTokenAtom = atom<string | null>(null);
