import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
// Retry access persists only on this browser until Disconnect clears it.
export const secretAtom = atomWithStorage(
  "submissions-retry-secret",
  "",
  undefined,
  { getOnInit: true },
);
export const themeAtom = atomWithStorage<"rocksky-dark" | "rocksky-light">(
  "submissions-theme",
  "rocksky-dark",
);
export const liveAtom = atom(true);
export const sectionAtom = atom<"overview" | "jobs" | "retention">("overview");
export const selectedJobAtom = atom<string | null>(null);
