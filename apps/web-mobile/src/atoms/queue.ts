import { atom } from "jotai";

export interface QueueTrack {
  uploadId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  duration: number;
  sha256: string;
}

export const queueAtom = atom<QueueTrack[]>([]);
export const queueIndexAtom = atom<number>(0);
