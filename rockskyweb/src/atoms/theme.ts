import { atom } from "jotai";

export const themeAtom = atom<{
  darkMode: boolean;
}>({
  darkMode: !localStorage.getItem("darkMode")
    ? true
    : localStorage.getItem("darkMode") === "true",
});
