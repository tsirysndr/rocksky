import { atomWithStorage } from "jotai/utils";
import type { QueueTrack } from "./queue";

/** Snapshot of the in-browser upload player, persisted to localStorage so a
 *  page reload can restore the queue, the current position in it, and the
 *  elapsed time within the current track (resume playback). */
export interface UploadResumeState {
  queue: QueueTrack[];
  index: number;
  /** Elapsed ms within the current track. */
  progressMs: number;
}

export const uploadResumeAtom = atomWithStorage<UploadResumeState | null>(
  "rocksky:upload-resume",
  null,
);
