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

/**
 * Set alongside the open atom to skip straight to the track search for a
 * playlist that already exists ("Add songs" on the playlist page).
 */
export const addSongsTargetAtom = atom<{ uri: string; name: string } | null>(
  null,
);

/** A song added through the modal, shaped like a playlist page track row. */
export type PendingPlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string;
  uri: string;
  duration: number;
  trackNumber: number;
  discNumber: number;
  albumUri: string;
  artistUri: string;
};

/**
 * Songs added in this session, keyed by playlist AT-URI. A new entry is only
 * visible to the AppView once jetstream ingests the commit, so the playlist
 * page merges these in to reflect the add immediately.
 */
export const pendingPlaylistTracksAtom = atom<
  Record<string, PendingPlaylistTrack[]>
>({});
