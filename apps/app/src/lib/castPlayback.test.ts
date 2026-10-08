import { expect, mock, spyOn, test } from "bun:test";
const loads: any[] = [];
const seeks: unknown[] = [];
let started: ((session: unknown) => void) | undefined;
let ended: (() => void) | undefined;
let stopped = 0;
let fail = false;
const shared: string[] = [];
const subscription = { remove() {} };
const remote = {
  async loadMedia(data: unknown) {
    if (fail) throw new Error("Receiver unavailable");
    loads.push(data);
  },
  async getMediaStatus() {
    return null;
  },
  onMediaStatusUpdated() {
    return subscription;
  },
  onMediaProgressUpdated() {
    return subscription;
  },
  async seek(options: unknown) {
    seeks.push(options);
  },
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
test("mixed queue preserves URLs, MIME, metadata, time units, and queue after a failed replacement; disconnect releases files", async () => {
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
      return { friendlyName: "Living Room" };
    },
  });
  await ready.promise;
  const tracks = [
    {
      uploadId: "local:1",
      localId: "1",
      title: "Local song",
      artist: "Artist",
      album: "Album",
      albumArtist: "Artist",
      songUri: "",
      albumUri: "",
      artistUri: "",
      sha256: "",
      albumArt: "",
      durationMs: 180_000,
    },
    {
      uploadId: "uploaded:2",
      title: "Uploaded song",
      artist: "Artist",
      album: "Album",
      albumArtist: "Artist",
      songUri: "",
      albumUri: "",
      artistUri: "",
      sha256: "",
      albumArt: "https://cdn.example/cover.jpg",
      durationMs: 240_000,
      mimeType: "audio/mpeg",
    },
  ];
  const paths = [
    "file:///music/local.flac",
    "https://api.example/stream?token=opaque",
  ];
  await castPlayback.load(tracks, paths, 1, 12_000, false);
  const load = loads[0];
  expect(load.startTime).toBe(12);
  expect(load.autoplay).toBe(false);
  expect(load.queueData.items[1].autoplay).toBe(false);
  expect(load.queueData.items[0].autoplay).toBe(true);
  expect(load.queueData.startIndex).toBe(1);
  const [local, uploaded] = load.queueData.items.map(
    (item: any) => item.mediaInfo,
  );
  expect(local.contentUrl).toBe("http://192.168.1.2:9999/local.flac");
  expect(local.contentType).toBe("audio/flac");
  expect(local.streamDuration).toBe(180);
  expect(local.customData.rocksky).toEqual({ index: 0, source: "local" });
  expect(uploaded.contentUrl).toBe(paths[1]);
  expect(uploaded.contentType).toBe("audio/mpeg");
  expect(uploaded.metadata.images).toEqual([{ url: tracks[1].albumArt }]);
  castPlayback.command({ cmd: "seek", positionMs: 42_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seeks).toEqual([{ position: 42 }]);
  fail = true;
  await expect(castPlayback.load([tracks[1]], [paths[1]], 0)).rejects.toThrow(
    "Receiver unavailable",
  );
  fail = false;
  castPlayback.command({ cmd: "skipTo", index: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(loads.at(-1).queueData.items.length).toBe(2);
  expect(loads.at(-1).queueData.startIndex).toBe(1);
  await castPlayback.disconnect();
  expect(castPlayback.connected()).toBe(false);
  expect(stopped).toBe(1);
  expect(castPlayback.command({ cmd: "play" }).ok).toBe(false);
  cleanup();
});

test("queue MIME checks overlap with bounded concurrency and are reused; shared album artwork is registered once", async () => {
  const gate = Promise.withResolvers<void>();
  const firstBatch = Promise.withResolvers<void>();
  let requests = 0;
  let active = 0;
  let peak = 0;
  const fetchResponse = async () => {
    requests++;
    active++;
    peak = Math.max(peak, active);
    if (active === 6) firstBatch.resolve();
    await gate.promise;
    active--;
    return new Response(null, { headers: { "content-type": "audio/mpeg" } });
  };
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fetchResponse, { preconnect: fetch.preconnect }),
  );
  const tracks = Array.from({ length: 18 }, (_, index) => ({
    uploadId: `startup:${index}`,
    title: `Track ${index}`,
    artist: "Artist",
    album: "Album",
    albumArtist: "Artist",
    songUri: "",
    albumUri: "",
    artistUri: "",
    sha256: "",
    durationMs: 180000,
    albumArt: "file:///music/shared-cover.jpg",
  }));
  const paths = tracks.map((track) => `https://example.test/${track.uploadId}`);
  try {
    const preparing = castPlayback.prepare(tracks, paths);
    await firstBatch.promise;
    expect(requests).toBe(6);
    gate.resolve();
    const items = await preparing;
    expect(peak).toBe(6);
    expect(requests).toBe(18);
    expect(items.map((item) => item.mediaInfo?.contentUrl)).toEqual(paths);
    expect(
      shared.filter((path) => path === "/music/shared-cover.jpg"),
    ).toHaveLength(1);
    await castPlayback.prepare(tracks, paths);
    expect(requests).toBe(18);
  } finally {
    gate.resolve();
    fetchMock.mockRestore();
  }
});
