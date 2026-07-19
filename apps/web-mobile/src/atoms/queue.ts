import { atom } from "jotai";

export interface QueueTrack {
  uploadId: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string | null;
  duration: number;
  sha256: string;
  songUri: string;
  streamUrl?: string;
}

export const queueAtom = atom<QueueTrack[]>([]);
export const queueIndexAtom = atom<number>(0);
