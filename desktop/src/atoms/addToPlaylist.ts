import { atom } from "jotai";

/**
 * The song the add-to-playlist palette is open for. Null = closed.
 */
export const addToPlaylistSongAtom = atom<{
  uri: string;
  title: string;
} | null>(null);
