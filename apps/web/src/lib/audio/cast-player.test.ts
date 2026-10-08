import { expect, mock, test } from "bun:test";
import { getDefaultStore } from "jotai";
import type { QueueTrack } from "../../atoms/queue";
const loads: any[] = [],
  inserts: any[] = [],
  urls: string[] = [];
let items: any[] = [],
  id = 1;
let ended: ((event: { sessionState: string }) => void) | undefined;
class MediaInfo {
  constructor(
    public contentId: string,
    public contentType: string,
  ) {}
}
class QueueItem {
  constructor(public media: MediaInfo) {}
}
class Request {
  insertBefore?: number;
  constructor(public items: QueueItem[]) {}
}
const media = {
  media: null as any,
  playerState: "PLAYING",
  currentItemId: 0,
  get items() {
    return items;
  },
  getEstimatedTime: () => 12,
  queueInsertItems(r: Request, ok: () => void) {
    inserts.push(r);
    const at = items.findIndex((i) => i.itemId === r.insertBefore);
    items.splice(
      at < 0 ? items.length : at,
      0,
      ...r.items.map((i) => ({ ...i, itemId: id++ })),
    );
    ok();
  },
  queueSetRepeatMode(_mode: unknown, ok: () => void) {
    ok();
  },
};
const session = {
  getMediaSession: () => media,
  getCastDevice: () => ({ friendlyName: "TV" }),
  getSessionObj: () => ({
    queueLoad(r: Request, ok: (m: unknown) => void) {
      loads.push(r);
      items = r.items.map((i) => ({ ...i, itemId: id++ }));
      media.media = items[0].media;
      media.currentItemId = items[0].itemId;
      ok(media);
    },
  }),
};
const context = {
  setOptions() {},
  getCurrentSession: () => session,
  getCastState: () => "none",
  requestSession: mock(async () => {}),
  addEventListener(type: string, fn: typeof ended) {
    if (type === "session") ended = fn;
  },
  endCurrentSession() {
    ended?.({ sessionState: "ended" });
  },
};
Object.assign(globalThis, {
  window: { isSecureContext: true, setInterval: () => 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  chrome: {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: "origin" },
      Image: class {
        constructor(public url: string) {}
      },
      media: {
        MediaInfo,
        QueueItem,
        QueueLoadRequest: Request,
        QueueInsertItemsRequest: Request,
        MusicTrackMediaMetadata: class {},
        RepeatMode: { OFF: "off", SINGLE: "single", ALL: "all" },
        StreamType: { BUFFERED: "buffered" },
        PlayerState: { PLAYING: "PLAYING" },
      },
    },
  },
  cast: {
    framework: {
      CastContext: { getInstance: () => context },
      CastContextEventType: {
        CAST_STATE_CHANGED: "state",
        SESSION_STATE_CHANGED: "session",
      },
      CastState: { NO_DEVICES_AVAILABLE: "none" },
      SessionState: {
        SESSION_STARTED: "started",
        SESSION_RESUMED: "resumed",
        SESSION_ENDED: "ended",
      },
      RemotePlayer: class {},
      RemotePlayerController: class {
        addEventListener() {}
      },
      RemotePlayerEventType: { ANY_CHANGE: "change" },
    },
  },
});
mock.module("../../api/uploads", () => ({
  getCastStreamUrl: async (id: string) => {
    urls.push(id);
    return `https://api.example/uploads/${id}/stream?token=scoped`;
  },
}));
mock.module("./rockbox-engine", () => ({
  getRockboxPlayer: () => ({ ready: false }),
}));
const { webCast, webCastAtom, initializeWebCast } = await import("./cast-player");
initializeWebCast();
test("Cast chooser stays accessible when no receivers have been discovered", async () => {
  expect(getDefaultStore().get(webCastAtom).available).toBe(true);
  await webCast.connect();
  expect(context.requestSession).toHaveBeenCalledTimes(1);
});
const track = (i: number): QueueTrack => ({
  uploadId: String(i),
  title: `Track ${i}`,
  artist: "Artist",
  albumArtist: "Artist",
  album: "Album",
  albumArt: null,
  duration: 180000,
  sha256: "",
  songUri: "",
  mimeType: "audio/mpeg",
});
function reset() {
  loads.length = 0;
  inserts.length = 0;
  urls.length = 0;
}
test("web Cast sends only the selected track from 10,000 entries; disconnect cancels preparation", async () => {
  reset();
  await webCast.load(
    Array.from({ length: 10000 }, (_, i) => track(i)),
    4321,
  );
  expect(urls).toEqual(["4321"]);
  expect(loads[0].items).toHaveLength(1);
  const info = loads[0].items[0].media;
  expect(info.contentId).toContain("token=scoped");
  expect(info.duration).toBe(180);
  expect(info.customData.rocksky.index).toBe(4321);
  webCast.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  expect(urls).toEqual(["4321"]);
});
test("web Cast prioritizes the next three before filling the remaining queue", async () => {
  reset();
  await webCast.load(Array.from({ length: 9 }, (_, i) => track(i)), 1);
  const start = Date.now();
  while (items.length < 9 && Date.now() - start < 3000)
    await new Promise((r) => setTimeout(r, 20));
  expect(items.map((i) => i.media.customData.rocksky.index)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8,
  ]);
  expect(loads).toHaveLength(1);
  expect(urls).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "0"]);
  expect(inserts.slice(0, 3).map((r) => r.items.length)).toEqual([1, 1, 1]);
  expect(inserts[0].items[0].preloadTime).toBe(20);
  webCast.disconnect();
});
test("replacing a queue cancels stale background inserts", async () => {
  reset();
  await webCast.load([track(0), track(1)], 0);
  await webCast.load([track(99)], 0);
  await new Promise((r) => setTimeout(r, 350));
  expect(urls).toEqual(["0", "99"]);
  expect(inserts).toHaveLength(0);
  expect(items[0].media.metadata.title).toBe("Track 99");
  webCast.disconnect();
});
