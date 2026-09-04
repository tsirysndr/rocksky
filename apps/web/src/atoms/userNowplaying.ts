import { atom } from "jotai";

export type UserNowPlaying = {
  title: string;
  artist: string;
  artistUri: string;
  songUri: string;
  albumUri: string;
  duration: number;
  /** Position at `sampledAt`; the live position is extrapolated from there. */
  progress: number;
  sampledAt: number;
  /** Raw position from the last poll, kept to tell a moving source from a stuck one. */
  reported: number;
  albumArt?: string;
  isPlaying: boolean;
  liked?: boolean;
  /** The remote device's name, or "Spotify". Null when the source is unnamed. */
  source?: string | null;
};

export const userNowPlayingAtom = atom<{
  [key: string]: UserNowPlaying | null;
}>({});
