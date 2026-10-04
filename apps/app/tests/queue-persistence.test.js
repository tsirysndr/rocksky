import { expect, test } from "bun:test";
import { createQueueSnapshotWriter } from "../src/lib/queueSnapshotWriter";

test("continuous playback updates do not starve scheduled saves", async () => {
  let value = 0;
  let saved;
  const received = new Promise((resolve) => {
    saved = resolve;
  });
  const writer = createQueueSnapshotWriter(
    () => value,
    async (snapshot) => saved(snapshot),
    20,
  );
  const poll = setInterval(() => {
    value += 1;
    writer.schedule(() => {});
  }, 2);
  let timeout;
  try {
    const result = await Promise.race([
      received,
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(null), 500);
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(0);
  } finally {
    clearInterval(poll);
    clearTimeout(timeout);
    await writer.flush();
  }
});

test("Play next snapshot survives delayed older writes and restores order and position", async () => {
  let queue = { tracks: ["current", "later"], index: 0, positionMs: 42000 };
  let disk;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const writer = createQueueSnapshotWriter(
    () => JSON.stringify(queue),
    async (snapshot) => {
      writes += 1;
      if (writes === 1) await blocked;
      disk = snapshot;
    },
    20,
  );
  const older = writer.flush();
  await Promise.resolve();
  queue = { ...queue, tracks: ["current", "play-next", "later"] };
  const inserted = writer.flush();
  await Promise.resolve();
  expect(writes).toBe(1);
  release();
  await Promise.all([older, inserted]);
  expect(JSON.parse(disk)).toEqual(queue);
});

test("a failed write does not prevent subsequent queue edits from being saved", async () => {
  let calls = 0;
  let disk;
  const writer = createQueueSnapshotWriter(
    () => "latest",
    async (snapshot) => {
      if (++calls === 1) throw new Error("storage unavailable");
      disk = snapshot;
    },
    20,
  );
  await expect(writer.flush()).rejects.toThrow("storage unavailable");
  await writer.flush();
  expect(disk).toBe("latest");
});
