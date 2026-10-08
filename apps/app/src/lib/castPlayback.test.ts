import { expect, mock, test } from "bun:test";
const loads: any[] = [];
const seeks: unknown[] = [];
const inserts: any[] = [];
let receiverItems: any[] = [];
let nextItemId = 1;
let started: ((session: unknown) => void) | undefined;
let ended: (() => void) | undefined;
let statusUpdated: ((media: any) => void) | undefined;
let stopped = 0;
let fail = false;
const shared: string[] = [];
const subscription = { remove() {} };
const remote = {
  async loadMedia(data: unknown) {
    if (fail) throw new Error("Receiver unavailable");
    loads.push(data);
    receiverItems = (data as any).queueData.items.map((item: any) => ({
      ...item,
      itemId: nextItemId++,
    }));
  },
  async getMediaStatus() {
    return {
      currentItemId: receiverItems[0]?.itemId,
      queueItems: receiverItems,
    };
  },
  async queueInsertItems(items: any[], before?: number) {
    inserts.push({ items, before });
    const at = receiverItems.findIndex((item) => item.itemId === before);
    receiverItems.splice(
      at < 0 ? receiverItems.length : at,
      0,
      ...items.map((item) => ({ ...item, itemId: nextItemId++ })),
    );
  },
  onMediaStatusUpdated(callback: typeof statusUpdated) {
    statusUpdated = callback;
    return subscription;
  },
  onMediaProgressUpdated() {
    return subscription;
  },
  async seek(options: unknown) {
    seeks.push(options);
  },
  async stop() {},
  async pause() {},
  async play() {},
};
const manager = {
  onSessionStarted(callback: typeof started) {
    started = callback;
    return subscription;
  },
  onSessionEnded(callback: typeof ended) {
    ended = callback;
    return subscription;
  },
  onSessionResumed() {
    return subscription;
  },
  onSessionSuspended() {
    return subscription;
  },
  onSessionStartFailed() {
    return subscription;
  },
  async getCurrentCastSession() {
    return null;
  },
  async endCurrentSession() {
    ended?.();
  },
};
mock.module("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: { RNGCCastContext: {} },
  Alert: { alert() {} },
}));
mock.module("react-native-google-cast", () => ({
  default: { getSessionManager: () => manager },
  MediaStreamType: { BUFFERED: "buffered" },
  MediaRepeatMode: { OFF: "off", ALL: "all", SINGLE: "single" },
}));
mock.module("expo", () => ({
  requireOptionalNativeModule: () => ({
    async shareFile(path: string) {
      shared.push(path);
      return {
        url: `http://192.168.1.2:9999/${path.split("/").pop()}`,
        contentType: "audio/flac",
      };
    },
    async stopServer() {
      stopped++;
    },
  }),
}));
const { castPlayback } = await import("./castPlayback");
const track = (index: number) => ({
  uploadId: `upload:${index}`,
  title: `Track ${index}`,
  artist: "Artist",
  album: "Album",
  albumArtist: "Artist",
  songUri: "",
  albumUri: "",
  artistUri: "",
  sha256: "",
  albumArt: "https://example.test/cover.jpg",
  durationMs: 180000,
  mimeType: "audio/mpeg",
});
async function connect() {
  loads.length = 0;
  inserts.length = 0;
  const ready = Promise.withResolvers<void>();
  const cleanup = castPlayback.start(
    async () => {
      ready.resolve();
    },
    () => {},
  );
  started?.({
    client: remote,
    async getCastDevice() {
      return { friendlyName: "TV" };
    },
  });
  await ready.promise;
  return async () => {
    await castPlayback.disconnect();
    cleanup();
  };
}
async function until(check: () => boolean) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 3000)
      throw new Error("Timed out waiting for background queue");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
test("10,000-track queue loads only selected track before returning; stop cancels background resolution", async () => {
  const cleanup = await connect();
  const resolved: number[] = [];
  try {
    await castPlayback.load(
      Array.from({ length: 10000 }, (_, i) => track(i)),
      async (_track, index) => {
        resolved.push(index);
        return `https://example.test/${index}`;
      },
      7890,
      12000,
      false,
    );
    expect(resolved).toEqual([7890]);
    expect(loads[0].queueData.items).toHaveLength(1);
    expect(loads[0].queueData.startIndex).toBe(0);
    expect(loads[0].startTime).toBe(12);
    expect(loads[0].autoplay).toBe(false);
    expect(loads[0].queueData.items[0].mediaInfo.customData.rocksky.index).toBe(
      7890,
    );
    expect(castPlayback.status().queueLen).toBe(10000);
    castPlayback.command({ cmd: "stop" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(resolved).toEqual([7890]);
    expect(inserts).toHaveLength(0);
  } finally {
    await cleanup();
  }
});
test("background appends upcoming songs then restores earlier songs without reloading; preserves mixed metadata", async () => {
  const cleanup = await connect();
  try {
    const tracks = Array.from({ length: 4 }, (_, i) => track(i));
    Object.assign(tracks[0], { localId: "local0", mimeType: undefined });
    const paths = [
      "file:///music/local.flac",
      ...[1, 2, 3].map((i) => `https://example.test/${i}`),
    ];
    await castPlayback.load(tracks, paths, 1);
    await until(() => receiverItems.length === 4);
    expect(loads).toHaveLength(1);
    expect(
      receiverItems.map((item) => item.mediaInfo.customData.rocksky.index),
    ).toEqual([0, 1, 2, 3]);
    const local = receiverItems[0].mediaInfo;
    expect(local.contentUrl).toBe("http://192.168.1.2:9999/local.flac");
    expect(local.contentType).toBe("audio/flac");
    expect(local.streamDuration).toBe(180);
    expect(local.customData.rocksky.source).toBe("local");
    expect(inserts[0].items[0].mediaInfo.customData.rocksky.index).toBe(2);
    expect(inserts.at(-1).before).toBeDefined();
  } finally {
    await cleanup();
  }
});
test("a slow background resolver cannot block controls or add stale tracks after replacement", async () => {
  const cleanup = await connect();
  const gate = Promise.withResolvers<string>();
  const waiting = Promise.withResolvers<void>();
  try {
    await castPlayback.load(
      [track(0), track(1)],
      async (_track, index) => {
        if (index === 1) {
          waiting.resolve();
          return gate.promise;
        }
        return "https://example.test/0";
      },
      0,
    );
    await waiting.promise;
    castPlayback.command({ cmd: "seek", positionMs: 42000 });
    await until(() => seeks.length > 0);
    expect(seeks.at(-1)).toEqual({ position: 42 });
    await castPlayback.load([track(99)], ["https://example.test/99"], 0);
    gate.resolve("https://example.test/stale");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(inserts).toHaveLength(0);
    expect(receiverItems[0].mediaInfo.metadata.title).toBe("Track 99");
  } finally {
    gate.resolve("");
    await cleanup();
  }
});
test("failed selected-track load preserves the old source for skip; skip prioritizes an unprepared track", async () => {
  const cleanup = await connect();
  const resolved: number[] = [];
  try {
    await castPlayback.load(
      Array.from({ length: 50 }, (_, i) => track(i)),
      async (_track, index) => {
        resolved.push(index);
        return `https://example.test/${index}`;
      },
      0,
    );
    fail = true;
    await expect(
      castPlayback.load([track(99)], ["https://example.test/99"], 0),
    ).rejects.toThrow("Receiver unavailable");
    fail = false;
    castPlayback.command({ cmd: "skipTo", index: 49 });
    await until(() => loads.length === 2);
    expect(resolved).toEqual([0, 49]);
    expect(loads[1].queueData.items[0].mediaInfo.customData.rocksky.index).toBe(
      49,
    );
    expect(castPlayback.status().queueLen).toBe(50);
  } finally {
    fail = false;
    await cleanup();
  }
});

test("a track ending before background insertion immediately starts its successor", async () => {
  const cleanup = await connect();
  try {
    await castPlayback.load(
      [track(0), track(1)],
      ["https://example.test/0", "https://example.test/1"],
      0,
    );
    statusUpdated?.({ playerState: "idle", idleReason: "finished", volume: 1 });
    await until(() => loads.length === 2);
    expect(loads[1].queueData.items[0].mediaInfo.customData.rocksky.index).toBe(
      1,
    );
    expect(loads[1].autoplay).toBe(true);
  } finally {
    await cleanup();
  }
});
