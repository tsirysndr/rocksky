import { atom } from "jotai";

export type NowPlaying = {
  title: string;
  artist: string;
  cover: string;
  duration: number;
  progress: number;
  isPlaying: boolean;
  liked: boolean;
  uri: string;
  album?: string;
  artistUri?: string;
  albumUri?: string;
  shuffle?: boolean;
  repeat?: "off" | "one" | "all";
};

export const nowPlayingAtom = atom<NowPlaying | null>(null);

export const progressAtom = atom(0);

export const playerAtom = atom<"rockbox" | "spotify" | "local" | "cast" | null>(null);

// Timestamp (ms) until which isPlaying updates from polling should be ignored
export const playbackLockedUntilAtom = atom(0);

// True while the in-app native engine is playing uploaded tracks; the remote
// polling fallback must not write (or clear) the now-playing atoms then.
export const localEngineActiveAtom = atom(false);
