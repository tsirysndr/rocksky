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
  trackNumber?: number | null;
  copyrightMessage?: string | null;
  genre?: string | null;
  releaseDate?: string | null;
  year?: number | null;
  streamUrl?: string;
}

export const queueAtom = atom<QueueTrack[]>([]);
export const queueIndexAtom = atom<number>(0);
export const queuePanelOpenAtom = atom<boolean>(false);
