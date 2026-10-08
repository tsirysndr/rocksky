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
const timers: { callback: () => void; ms: number }[] = [];
let refreshStatus: (() => void) | undefined;
let mediaUpdate: ((alive: boolean) => void) | undefined;
const media = {
  getStatus(_request: unknown, ok: () => void) { refreshStatus?.(); ok(); },
  addUpdateListener: (fn: (alive: boolean) => void) => { mediaUpdate = fn; },
  removeUpdateListener: () => { mediaUpdate = undefined; },
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
let queueRequest: any;
let queueListener: ((namespace: string, message: unknown) => void) | undefined;
const session = {
  addMessageListener(_namespace: string, listener: typeof queueListener) { queueListener = listener; },
  removeMessageListener() { queueListener = undefined; },
  sendMessage: async (_namespace: string, request: unknown) => { queueRequest = request; },
  addEventListener() {},
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
  window: { isSecureContext: true, setInterval: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return 0; } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  chrome: {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: "origin" },
      Image: class {
        constructor(public url: string) {}
      },
      media: {
        GetStatusRequest: class {},
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
      SessionEventType: { MEDIA_SESSION: "media" },
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
  expect(info.customData.rocksky.queuePosition).toBe(4322);
  expect(info.customData.rocksky.queueTotal).toBe(10000);
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

test("receiver updates synchronize the current track, pause state and progress", async () => {
  const { nowPlayingAtom } = await import("../../atoms/nowpaying");
  const { queueIndexAtom, queueAtom } = await import("../../atoms/queue");
  const store = getDefaultStore();
  reset();
  await webCast.load([track(0), track(1), track(2)], 0);
  const start = Date.now();
  while (items.length < 3 && Date.now() - start < 2500)
    await new Promise((resolve) => setTimeout(resolve, 20));
  media.media = items[1].media;
  media.currentItemId = items[1].itemId;
  media.playerState = "PAUSED";
  store.set(queueAtom, [track(99)]); // late local engine snapshot
  mediaUpdate?.(true);
  expect(store.get(queueAtom).map((t) => t.title)).toEqual(["Track 0", "Track 1", "Track 2"]);
  expect(store.get(queueIndexAtom)).toBe(1);
  expect(store.get(nowPlayingAtom)?.title).toBe("Track 1");
  expect(store.get(nowPlayingAtom)?.progress).toBe(12000);
  expect(store.get(nowPlayingAtom)?.isPlaying).toBe(false);
  media.playerState = "PLAYING";
  webCast.disconnect();
});
test("resumed sessions keep their queue synchronized after later insertions", async () => {
  const { queueAtom, queueIndexAtom } = await import("../../atoms/queue");
  const store = getDefaultStore();
  ended?.({ sessionState: "resumed" });
  const added = new MediaInfo("https://example.com/new.mp3", "audio/mpeg") as any;
  added.metadata = { title: "Added from another sender", artist: "Artist" };
  items.push({ itemId: 900, media: added });
  media.media = added;
  media.currentItemId = 900;
  mediaUpdate?.(true);
  expect(store.get(queueAtom).at(-1)?.title).toBe("Added from another sender");
  expect(store.get(queueIndexAtom)).toBe(items.length - 1);
  webCast.disconnect();
});

test("currentItemId wins over stale media metadata during track advancement", async () => {
  const { nowPlayingAtom } = await import("../../atoms/nowpaying");
  const { queueIndexAtom } = await import("../../atoms/queue");
  const store = getDefaultStore();
  reset();
  await webCast.load([track(0), track(1), track(2)], 0);
  const start = Date.now();
  while (items.length < 3 && Date.now() - start < 2500)
    await new Promise((resolve) => setTimeout(resolve, 20));
  // Real Cast updates may advance the current item before replacing Media.media.
  media.currentItemId = items[2].itemId;
  mediaUpdate?.(true);
  expect(store.get(nowPlayingAtom)?.title).toBe("Track 2");
  expect(store.get(queueIndexAtom)).toBe(2);
  // Missed update events recover through a real status request, not a reread
  // of the same cached Media object.
  refreshStatus = () => { media.currentItemId = items[1].itemId; };
  timers.find((t) => t.ms === 3000)!.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.get(nowPlayingAtom)?.title).toBe("Track 1");
  expect(store.get(queueIndexAtom)).toBe(1);
  refreshStatus = undefined;
  webCast.disconnect();
});

test("a limited two-item CAF status never truncates the owned full queue", async () => {
  const { queueAtom, queueIndexAtom } = await import("../../atoms/queue");
  reset();
  await webCast.load(Array.from({ length: 7 }, (_, i) => track(i)), 0);
  const start = Date.now();
  while (items.length < 7 && Date.now() - start < 3000)
    await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 300));
  items = items.slice(3, 5);
  media.currentItemId = items[0].itemId;
  mediaUpdate?.(true);
  expect(getDefaultStore().get(queueAtom)).toHaveLength(7);
  expect(getDefaultStore().get(queueIndexAtom)).toBe(3);
  webCast.disconnect();
});
test("resumed web queue replaces two cached tracks with all receiver pages", async () => {
  const { queueAtom, queueIndexAtom } = await import("../../atoms/queue");
  const { nowPlayingAtom } = await import("../../atoms/nowpaying");
  ended?.({ sessionState: "resumed" });
  const full = Array.from({ length: 20 }, (_, i) => ({ itemId: 1000 + i,
    media: { contentId: `https://example.com/${i}.mp3`, contentType: "audio/mpeg",
      metadata: { title: `Receiver ${i}`, artist: "Artist" } } }));
  const state = { media: full[17].media, currentItemId: 1017, currentTime: 42,
    duration: 180, playerState: "PLAYING" };
  const reply = (offset: number, page: unknown[]) => queueListener!("", JSON.stringify({
    type: "snapshot", requestId: queueRequest.requestId, revision: 50, offset,
    total: 20, items: page, state }));
  reply(0, full.slice(0, 16));
  expect(getDefaultStore().get(queueAtom)[0].title).toBe("Receiver 0");
  expect(getDefaultStore().get(queueAtom).at(-1)?.title).toBe("Receiver 17");
  expect(getDefaultStore().get(nowPlayingAtom)?.title).toBe("Receiver 17");
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(queueRequest.offset).toBe(16);
  reply(16, full.slice(16));
  expect(getDefaultStore().get(queueAtom)).toHaveLength(20);
  expect(getDefaultStore().get(queueIndexAtom)).toBe(17);
  expect(getDefaultStore().get(nowPlayingAtom)?.title).toBe("Receiver 17");
  expect(getDefaultStore().get(nowPlayingAtom)?.progress).toBe(42000);
  webCast.disconnect();
});

test("decoded receiver messages update the full queue without a cached SDK media session", async () => {
  const { queueAtom, queueIndexAtom } = await import("../../atoms/queue");
  const { nowPlayingAtom } = await import("../../atoms/nowpaying");
  ended?.({ sessionState: "resumed" });
  const cached = media.media;
  media.media = null;
  const full = Array.from({ length: 8 }, (_, i) => ({ itemId: 2000 + i,
    media: { contentId: `https://example.com/${i}.mp3`, contentType: "audio/mpeg",
      metadata: { title: `Live ${i}`, artist: "Artist" } } }));
  const state = { media: full[3].media, currentItemId: 2003, currentTime: 21,
    duration: 205, playerState: "PLAYING" };
  queueListener!("", { type: "snapshot", requestId: queueRequest.requestId,
    revision: 70, offset: 0, total: 8, items: full, state });
  expect(getDefaultStore().get(queueAtom)).toHaveLength(8);
  expect(getDefaultStore().get(queueIndexAtom)).toBe(3);
  expect(getDefaultStore().get(nowPlayingAtom)?.title).toBe("Live 3");
  // The TV advances while Chrome still has no usable media object. A broadcast
  // must not be discarded just because it has no outstanding request ID.
  queueListener!("", JSON.stringify({ type: "status", state: {
    ...state, media: full[4].media, currentItemId: 2004, currentTime: 2,
  } }));
  expect(getDefaultStore().get(queueIndexAtom)).toBe(4);
  expect(getDefaultStore().get(nowPlayingAtom)?.title).toBe("Live 4");
  expect(getDefaultStore().get(nowPlayingAtom)?.progress).toBe(2000);
  expect(getDefaultStore().get(nowPlayingAtom)?.duration).toBe(205000);
  media.media = cached;
  webCast.disconnect();
});
