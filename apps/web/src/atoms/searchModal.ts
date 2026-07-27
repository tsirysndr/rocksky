import { atom } from "jotai";

/** Scope the command palette can be filtered to. */
export type SearchScope =
  | "all"
  | "tracks"
  | "artists"
  | "albums"
  | "playlists"
  | "users";

/**
 * Whether the Raycast-style command-palette search modal is open. Opened by
 * clicking/focusing the sidebar search input or pressing "/" (see
 * components/KeyboardShortcuts), rendered once globally from the root route.
 */
export const searchModalOpenAtom = atom<boolean>(false);

/**
 * Scope the palette should start on when next opened. Set alongside
 * searchModalOpenAtom so shortcuts can open the palette pre-filtered (e.g. "a"
 * → artists); the sidebar trigger and "/" use "all".
 */
export const searchModalScopeAtom = atom<SearchScope>("all");
