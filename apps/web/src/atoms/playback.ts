import { atomWithStorage } from "jotai/utils";

export type RepeatMode = "off" | "one" | "all";

export const shuffleAtom = atomWithStorage<boolean>("playback_shuffle", false);
export const repeatModeAtom = atomWithStorage<RepeatMode>("playback_repeat", "off");
