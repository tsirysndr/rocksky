import { atom } from "jotai";

const STORAGE_KEY = "rightPaneHidden";

const stored = atom<boolean>(localStorage.getItem(STORAGE_KEY) === "true");

export const rightPaneHiddenAtom = atom(
  (get) => get(stored),
  (_get, set, hidden: boolean) => {
    set(stored, hidden);
    localStorage.setItem(STORAGE_KEY, String(hidden));
  },
);
