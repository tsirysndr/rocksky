import { atom } from "jotai";

export const themeAtom = atom<{
  darkMode: boolean;
}>({
  darkMode: true,
});
