/** Scope the command palette can be filtered to. */
@genType
type scope = [#all | #tracks | #artists | #albums | #playlists | #users]

/**
 * Whether the Raycast-style command-palette search modal is open. Opened by
 * clicking/focusing the sidebar search input or pressing "/" (see
 * components/KeyboardShortcuts), rendered once globally from the root route.
 */
@genType
let searchModalOpenAtom: Jotai.t<bool> = Jotai.atom(false)

/**
 * Scope the palette should start on when next opened. Set alongside
 * searchModalOpenAtom so shortcuts can open the palette pre-filtered (e.g. "a"
 * → artists); the sidebar trigger and "/" use "all".
 */
@genType
let searchModalScopeAtom: Jotai.t<scope> = Jotai.atom(#all)

/**
 * Whether the LIBRARY quick-search palette is open — searches the authenticated
 * user's own library (Navidrome) for songs/albums/artists, with add-to-queue
 * actions on results. Opened with Shift+L (see components/KeyboardShortcuts);
 * only meaningful for signed-in users.
 */
@genType
let librarySearchOpenAtom: Jotai.t<bool> = Jotai.atom(false)
