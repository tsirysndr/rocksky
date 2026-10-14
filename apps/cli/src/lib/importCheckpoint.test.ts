import { expect, test } from "bun:test";
import { restoreProgress, type Checkpoint } from "./importCheckpoint";
import { formatImportError } from "./importError";

const tracks = Array.from({ length: 6 }, (_, i) => ({
  timestamp: i, title: `Track ${i}`, artist: "Artist",
}));
function snapshot(tracker: ReturnType<typeof restoreProgress>["tracker"]): Checkpoint {
  return JSON.parse(JSON.stringify({
    source: "/history.json", format: "spotify", updatedAt: new Date().toISOString(),
    cursor: tracker.mark < 0 ? null : { ...tracks[tracker.mark], count: tracker.mark + 1 },
    completed: tracker.outstanding.map((i) => tracks[i]),
  }));
}

test("interrupt with a failed first record preserves out-of-order successes", () => {
  const { tracker } = restoreProgress(tracks, null);
  tracker.complete(3);
  tracker.complete(1);
  const resumed = restoreProgress(tracks, snapshot(tracker));
  expect(resumed.pendingIndices).toEqual([0, 2, 4, 5]);
  resumed.tracker.complete(0);
  expect(resumed.tracker.mark).toBe(1);
  resumed.tracker.complete(2);
  expect(resumed.tracker.mark).toBe(3);
  expect(restoreProgress(tracks, snapshot(resumed.tracker)).pendingIndices).toEqual([4, 5]);
});

test("legacy cursor checkpoints still resume", () => {
  expect(restoreProgress(tracks, {
    source: "/history.json", format: "spotify", updatedAt: "",
    cursor: { ...tracks[1], count: 2 },
  }).pendingIndices).toEqual([2, 3, 4, 5]);
});

test("completed imports stay complete on the next run", () => {
  const { tracker } = restoreProgress(tracks, null);
  for (let i = tracks.length - 1; i >= 0; i--) tracker.complete(i);
  expect(tracker.outstanding).toEqual([]);
  expect(restoreProgress(tracks, snapshot(tracker)).pendingIndices).toEqual([]);
});

test("sparse successes are matched by identity when input changes", () => {
  const { tracker } = restoreProgress(tracks, null);
  tracker.complete(3);
  expect(restoreProgress(tracks.slice(2), snapshot(tracker)).pendingIndices).toEqual([0, 2, 3]);
});

test("rejection reasons include server code and status", () => {
  expect(formatImportError(Object.assign(new Error("Invalid timestamp"), {
    kind: "InvalidRecord", status: 400,
  }))).toBe("Invalid timestamp [InvalidRecord, HTTP 400]");
  expect(formatImportError(new Error("fetch failed"))).toBe("fetch failed");
  expect(formatImportError("connection closed")).toBe("connection closed");
});
