import { atom, getDefaultStore } from "jotai";
import { type PickedAudioFile, uploadTrack } from "../api/uploads";
import { storage } from "../storage";
import { queryClient } from "./queryClient";
import { describeUploadError } from "./uploadError";
import { localMusicNative } from "../../modules/rocksky-engine";
export type UploadJob = {
  id: number;
  owner: string;
  file: PickedAudioFile;
  status:
    | "queued"
    | "preparing"
    | "uploading"
    | "processing"
    | "done"
    | "skipped"
    | "error";
  progress: number;
  error?: string;
  missingFields?: string[];
  hint?: string;
  retryable?: boolean;
  title?: string;
};
export const uploadJobsAtom = atom<UploadJob[]>([]);
const store = getDefaultStore();
let sequence = 0;
let running = false;
let controller: AbortController | null = null;
const update = (id: number, patch: Partial<UploadJob>) =>
  store.set(uploadJobsAtom, (jobs) =>
    jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  );
async function drain() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = store
        .get(uploadJobsAtom)
        .find(
          (item) => item.status === "queued" && item.owner === storage.getDid(),
        );
      if (!job || !storage.getToken()) break;
      controller = new AbortController();
      const activeController = controller;
      const session = storage.getToken();
      let prepared: PickedAudioFile | undefined;
      update(job.id, {
        status: job.file.localTrackId ? "preparing" : "uploading",
        progress: 0,
        error: undefined,
      });
      try {
        if (job.file.localTrackId)
          prepared = await localMusicNative.prepareUpload(
            job.file.localTrackId,
          );
        if (
          activeController.signal.aborted ||
          job.owner !== storage.getDid() ||
          session !== storage.getToken()
        )
          throw new Error("Upload cancelled");
        update(job.id, { status: "uploading" });
        const result = await uploadTrack(
          prepared ?? job.file,
          (progress) =>
            update(job.id, {
              progress,
              status: progress >= 100 ? "processing" : "uploading",
            }),
          activeController.signal,
        );
        update(job.id, {
          status: "done",
          progress: 100,
          title: `${result.track.title} · ${result.track.artist}`,
        });
        if (job.owner === storage.getDid()) {
          void queryClient.invalidateQueries({ queryKey: ["uploads"] });
          void queryClient.invalidateQueries({ queryKey: ["navidrome"] });
        }
      } catch (error) {
        const failure = describeUploadError(error);
        update(job.id, {
          status: failure.skipped ? "skipped" : "error",
          error: failure.message,
          missingFields: failure.missingFields,
          hint: failure.hint,
          retryable: failure.retryable,
        });
      } finally {
        if (prepared)
          await localMusicNative
            .releaseUpload(prepared.uri)
            .catch(() => undefined);
        controller = null;
      }
    }
  } finally {
    running = false;
  }
}
export function enqueueUploads(files: PickedAudioFile[]) {
  const owner = storage.getDid();
  if (!owner || !storage.getToken()) return;
  store.set(uploadJobsAtom, (jobs) => [
    ...jobs,
    ...files.map(
      (file): UploadJob => ({
        id: ++sequence,
        owner,
        file,
        status: "queued",
        progress: 0,
      }),
    ),
  ]);
  void drain();
}
export function retryUpload(id: number) {
  const job = store.get(uploadJobsAtom).find((item) => item.id === id);
  if (
    !job ||
    job.owner !== storage.getDid() ||
    job.status !== "error" ||
    !job.retryable
  )
    return;
  update(id, {
    status: "queued",
    error: undefined,
    missingFields: undefined,
    hint: undefined,
    retryable: undefined,
  });
  void drain();
}
export function clearCompletedUploads() {
  store.set(uploadJobsAtom, (jobs) =>
    jobs.filter((job) => job.status !== "done" && job.status !== "skipped"),
  );
}
export function cancelUploadSession() {
  controller?.abort();
  store.set(uploadJobsAtom, []);
}
