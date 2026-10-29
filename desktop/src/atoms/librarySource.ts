import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { LocalAlbum } from "../api/localLibrary";
import type { LibraryEntry } from "../api/remoteLibraries";

export const librarySourceAtom = atomWithStorage(
  "library:source",
  "uploaded",
  undefined,
  { getOnInit: true },
);

// A selection can arrive from any page; the library consumes it after navigation.
export const libraryAlbumSelectionAtom = atom<
  | { source: "local"; album: LocalAlbum }
  | { source: "remote"; sourceId: string; album: LibraryEntry }
  | null
>(null);
