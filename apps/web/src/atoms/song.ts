import { atom } from "jotai";

export const songAtom = atom<{
  title: string;
  artist: string;
  artists: {
    id: string;
    name: string;
    picture?: string;
    uri?: string;
  }[];
  albumArtist: string;
  cover: string;
  listeners: number;
  scrobbles: number;
  tags: string[];
  lyrics?: string;
  artistUri?: string;
  albumUri?: string;
  spotifyLink?: string;
  composer?: string | null;
  uri?: string;
  /** The song's own AT-URI. On a scrobble page `uri` is the scrobble's. */
  trackUri?: string;
  /** Whether the signed-in user has loved this song. */
  liked?: boolean;
} | null>(null);
