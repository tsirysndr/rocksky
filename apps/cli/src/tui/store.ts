import { atom } from "jotai";
import { loadToken } from "lib/token";
import type { PlayerStatus } from "rockbox-ffi/node";

/** The current session token, or undefined when signed out. Reactive so the
 *  views refresh when the user signs in / out. */
export const authAtom = atom<string | undefined>(loadToken());

/** Whether the sign-in / sign-out overlay is open. */
export const authOpenAtom = atom(false);

/** Active top-level tab (0 = Global Scrobbles, 1 = My Music). */
export const tabAtom = atom(0);

/** Latest player status, refreshed on a poll by <App>. */
export const playerStatusAtom = atom<PlayerStatus | null>(null);

/** Transient playback message (buffering / error), shown under My Music. */
export const playbackMessageAtom = atom("");

/** Title of the most recently scrobbled track (drives the ♥ indicator). */
export const scrobbledTitleAtom = atom("");

/** Whether the `/` search overlay is open. */
export const searchOpenAtom = atom(false);

/** Which corpus the search overlay queries. */
export type SearchContext = "global" | "uploads";
export const searchContextAtom = atom<SearchContext>("global");

/** Whether the current-queue overlay is open. */
export const queueOpenAtom = atom(false);

/** Bumped on every queue mutation so views refresh instantly. */
export const queueVersionAtom = atom(0);

/** Whether the cache-management overlay is open. */
export const cacheOpenAtom = atom(false);

/** A track pending "add to playlist" (its Subsonic song id + title), or null. */
export const addToPlaylistAtom = atom<{ trackId: string; title: string } | null>(
  null,
);

/** Whether the sound / equalizer overlay is open. */
export const soundOpenAtom = atom(false);

/** Whether the full-help modal is open. */
export const helpOpenAtom = atom(false);
