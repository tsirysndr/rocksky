import { expect, test } from "bun:test";
import { startProgressiveQueue } from "./progressiveQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("first track starts and returns while the remaining track is still loading", async () => {
  const second = deferred<number>();
  const events: string[] = [];
  const { background } = await startProgressiveQueue([1, 2, 3], {
    current: () => true,
    resolve: async (item) => {
      events.push(`resolve:${item}`);
      return item === 2 ? second.promise : item;
    },
    start: async (item) => {
      events.push(`start:${item}`);
      return true;
    },
    append: async (item) => {
      events.push(`append:${item}`);
      return true;
    },
    skipped: () => {},
  });
  expect(events).toEqual(["resolve:1", "start:1", "resolve:2"]);
  second.resolve(2);
  await background;
  expect(events).toEqual([
    "resolve:1",
    "start:1",
    "resolve:2",
    "append:2",
    "resolve:3",
    "append:3",
  ]);
});

test("shuffle order is preserved and a failed later track does not block its successor", async () => {
  const played: number[] = [];
  const skipped: number[] = [];
  const { background } = await startProgressiveQueue([3, 1, 2], {
    current: () => true,
    resolve: async (item) => {
      if (item === 1) throw new Error("HTTP 404");
      return item;
    },
    start: async (item) => {
      played.push(item);
      return true;
    },
    append: async (item) => {
      played.push(item);
      return true;
    },
    skipped: (items) => skipped.push(...items),
  });
  await background;
  expect(played).toEqual([3, 2]);
  expect(skipped).toEqual([1]);
});

test("changing queue or device during resolution prevents stale append and further requests", async () => {
  let current = true;
  const second = deferred<number>();
  const resolved: number[] = [];
  const appended: number[] = [];
  const { background } = await startProgressiveQueue([1, 2, 3], {
    current: () => current,
    resolve: async (item) => {
      resolved.push(item);
      return item === 2 ? second.promise : item;
    },
    start: async () => true,
    append: async (item) => {
      appended.push(item);
      return true;
    },
    skipped: () => {
      throw new Error("Cancelled work must not show errors");
    },
  });
  current = false;
  second.resolve(2);
  await background;
  expect(resolved).toEqual([1, 2]);
  expect(appended).toEqual([]);
});

test("first track failure rejects without loading the rest", async () => {
  const resolved: number[] = [];
  await expect(
    startProgressiveQueue([1, 2], {
      current: () => true,
      resolve: async (item) => {
        resolved.push(item);
        return item;
      },
      start: async () => false,
      append: async () => {
        throw new Error("Must not append");
      },
      skipped: () => {},
    }),
  ).rejects.toThrow("Could not start playback");
  expect(resolved).toEqual([1]);
});

test("a rejected append stops loading after queue ownership is lost", async () => {
  const resolved: number[] = [];
  const { background } = await startProgressiveQueue([1, 2, 3], {
    current: () => true,
    resolve: async (item) => {
      resolved.push(item);
      return item;
    },
    start: async () => true,
    append: async () => false,
    skipped: () => {},
  });
  await background;
  expect(resolved).toEqual([1, 2]);
});
