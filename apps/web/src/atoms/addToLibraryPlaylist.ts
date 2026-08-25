import { atom } from "jotai";

/**
 * The library song the add-to-playlist palette is open for, by navidrome id.
 * Null = closed.
 */
export const addToLibraryPlaylistSongAtom = atom<{
  id: string;
  title: string;
} | null>(null);
