import { atom } from "jotai";

/** Create Playlist modal open state. Opened by the tab button or "c". */
export const createPlaylistModalOpenAtom = atom<boolean>(false);

/**
 * Set alongside the open atom to edit an existing playlist instead of creating
 * one: the modal prefills from it and saves with updatePlaylist. Null = create.
 */
export const editingPlaylistAtom = atom<{
  uri: string;
  name: string;
  description?: string;
} | null>(null);
