import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
// Credentials never enter persistent storage, URLs, or query keys.
export const secretAtom = atom("");
export const themeAtom = atomWithStorage<"rocksky-dark" | "rocksky-light">(
  "submissions-theme",
  "rocksky-dark",
);
export const liveAtom = atom(true);
export const sectionAtom = atom<"overview" | "jobs" | "retention">("overview");
export const selectedJobAtom = atom<string | null>(null);
