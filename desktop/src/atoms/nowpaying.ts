import { atom } from "jotai";

export const nowPlayingAtom = atom<{
  title: string;
  artist: string;
  artistUri: string;
  songUri: string;
  albumUri: string;
  album?: string;
  duration: number;
  progress: number;
  albumArt?: string;
  isPlaying: boolean;
  liked: boolean;
  sha256: string;
  /** Audio codec / container (e.g. "mp3", "flac"), when known. */
  codec?: string;
  /** Audio sample rate in Hz (e.g. 44100), when known. */
  sampleRate?: number;
} | null>(null);
