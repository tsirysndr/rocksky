import { atom } from "jotai";

// State for the library playlist modal — the navidrome-backed counterpart of
// atoms/createPlaylist. Kept separate because the two modals address playlists
// by different keys: an AT-URI there, a navidrome id here. Sharing one atom
// would let a library playlist open in the ATProto modal and vice versa.

/** Library playlist modal open state. Opened from the Playlists tab. */
export const libraryPlaylistModalOpenAtom = atom<boolean>(false);

/**
 * Set alongside the open atom to rename an existing library playlist instead of
 * creating one. Null = create.
 */
export const editingLibraryPlaylistAtom = atom<{
  id: string;
  name: string;
  description?: string;
} | null>(null);

/**
 * Set alongside the open atom to skip straight to the song search for a
 * playlist that already exists ("Add songs" on the library playlist page).
 */
export const addLibrarySongsTargetAtom = atom<{
  id: string;
  name: string;
} | null>(null);

/**
 * Navidrome song ids the new playlist should already contain, set when the
 * modal is opened from a track's "Add to playlist → New playlist". Ignored
 * when editing or adding to an existing playlist.
 */
export const newLibraryPlaylistSeedSongsAtom = atom<string[]>([]);
