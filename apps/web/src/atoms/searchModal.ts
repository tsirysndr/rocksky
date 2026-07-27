import { atom } from "jotai";

/**
 * Whether the Raycast-style command-palette search modal is open. Opened by
 * clicking/focusing the sidebar search input or pressing "/" (see
 * components/KeyboardShortcuts), rendered once globally from the root route.
 */
export const searchModalOpenAtom = atom<boolean>(false);
