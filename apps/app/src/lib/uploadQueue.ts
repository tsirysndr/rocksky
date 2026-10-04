import { atom, getDefaultStore } from "jotai";
import { type PickedAudioFile, uploadTrack } from "../api/uploads";
import { storage } from "../storage";
import { queryClient } from "./queryClient";
export type UploadJob = {
  id: number;
  owner: string;
  file: PickedAudioFile;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  progress: number;
  error?: string;
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
      update(job.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const result = await uploadTrack(
          job.file,
          (progress) =>
            update(job.id, {
              progress,
              status: progress >= 100 ? "processing" : "uploading",
            }),
          controller.signal,
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
        update(job.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      } finally {
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
  if (!job || job.owner !== storage.getDid() || job.status !== "error") return;
  update(id, { status: "queued", error: undefined });
  void drain();
}
export function clearCompletedUploads() {
  store.set(uploadJobsAtom, (jobs) =>
    jobs.filter((job) => job.status !== "done"),
  );
}
export function cancelUploadSession() {
  controller?.abort();
  store.set(uploadJobsAtom, []);
}
