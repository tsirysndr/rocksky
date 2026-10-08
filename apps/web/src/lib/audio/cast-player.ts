import { atom, getDefaultStore } from "jotai";
import {
  castRequests,
  abortableDelay,
  castCancelled,
} from "../../../../shared/castRequests";
import { getCastStreamUrl } from "../../api/uploads";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../../atoms/queue";
import { repeatModeAtom, type RepeatMode } from "../../atoms/playback";
import { getRockboxPlayer } from "./rockbox-engine";

export const webCastAtom = atom({
  available: false,
  connected: false,
  name: "Chromecast",
  error: "",
});
const store = getDefaultStore();
let context: cast.framework.CastContext | null = null;
let job: AbortController | null = null;
let initialized = false;
let advancing = false;
const mimeCache = new Map<string, string>();
let ownedQueue: QueueTrack[] | null = null;
let resumedIndices: number[] | null = null;
let commands: Promise<unknown> = Promise.resolve();
const call = <T>(
  fn: (
    ok: (value: T) => void,
    fail: (error: chrome.cast.Error) => void,
  ) => void,
) => new Promise<T>(fn);
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = commands.then(fn);
  commands = next.catch(() => {});
  return next;
}
function session() {
  return context?.getCurrentSession();
}
function media() {
  return session()?.getMediaSession();
}
function report(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return;
  const message =
    error instanceof Error
      ? error.message
      : "Could not control Chromecast. Check the connection and try again.";
  store.set(webCastAtom, (s) => ({ ...s, error: message }));
}
export function castAction(action: Promise<unknown>) {
  void action.catch(report);
}
function repeat(mode: RepeatMode) {
  return mode === "one"
    ? chrome.cast.media.RepeatMode.SINGLE
    : mode === "all"
      ? chrome.cast.media.RepeatMode.ALL
      : chrome.cast.media.RepeatMode.OFF;
}
function trackData(info?: chrome.cast.media.MediaInfo | null): {
  index?: number;
  track?: QueueTrack;
} {
  return (
    (
      info?.customData as
        | { rocksky?: { index?: number; track?: QueueTrack } }
        | undefined
    )?.rocksky ?? {}
  );
}
function mirror() {
  if (store.get(playerAtom) !== "cast") return;
  const m = media();
  if (!m?.media) return;
  const data = trackData(m.media);
  const md = m.media.metadata as chrome.cast.media.MusicTrackMediaMetadata;
  const tracks = store.get(queueAtom);
  const rawIndex = data.index ?? 0;
  const index = resumedIndices
    ? Math.max(0, resumedIndices.indexOf(rawIndex))
    : rawIndex;
  const track = ownedQueue === tracks ? tracks[index] : data.track;
  const wasPlaying = store.get(nowPlayingAtom)?.isPlaying;
  store.set(queueIndexAtom, index);
  store.set(nowPlayingAtom, {
    title: track?.title ?? md?.title ?? "",
    artist: track?.artist ?? md?.artist ?? "",
    album: track?.album ?? md?.albumName ?? "",
    artistUri: "",
    albumUri: "",
    songUri: track?.songUri ?? "",
    sha256: track?.sha256 ?? "",
    liked:
      store.get(nowPlayingAtom)?.title === (track?.title ?? md?.title)
        ? (store.get(nowPlayingAtom)?.liked ?? false)
        : false,
    albumArt: track?.albumArt ?? md?.images?.[0]?.url,
    duration: (m.media.duration || (track?.duration ?? 0) / 1000) * 1000,
    progress: Math.max(0, m.getEstimatedTime()) * 1000,
    isPlaying: m.playerState === chrome.cast.media.PlayerState.PLAYING,
  });
  if (
    ownedQueue === tracks &&
    wasPlaying &&
    !advancing &&
    m.playerState === chrome.cast.media.PlayerState.IDLE &&
    m.idleReason === chrome.cast.media.IdleReason.FINISHED &&
    tracks[index + 1] &&
    !m.items?.some((item) => trackData(item.media).index === index + 1)
  ) {
    advancing = true;
    castAction(
      webCast.load(tracks, index + 1).finally(() => {
        advancing = false;
      }),
    );
  }
}
async function itemFor(track: QueueTrack, index: number, signal: AbortSignal) {
  const url =
    track.streamUrl ?? (await getCastStreamUrl(track.uploadId, signal));
  if (signal.aborted) throw castCancelled();
  let mime = track.mimeType || mimeCache.get(url);
  if (!mime) {
    const response = await castRequests.fetch(url, { method: "HEAD", signal });
    mime = response.headers.get("content-type")?.split(";")[0];
    if (
      !response.ok ||
      !mime ||
      !(mime.startsWith("audio/") || mime === "application/ogg")
    )
      throw new Error(
        "Could not identify this track's audio format for Chromecast.",
      );
    mimeCache.set(url, mime);
  }
  const info = new chrome.cast.media.MediaInfo(url, mime);
  info.streamType = chrome.cast.media.StreamType.BUFFERED;
  if (track.duration > 0) info.duration = track.duration / 1000;
  const metadata = new chrome.cast.media.MusicTrackMediaMetadata();
  Object.assign(metadata, {
    title: track.title,
    artist: track.artist,
    albumName: track.album,
    albumArtist: track.albumArtist,
  });
  if (track.albumArt) metadata.images = [new chrome.cast.Image(track.albumArt)];
  info.metadata = metadata;
  const { streamUrl: _url, ...safeTrack } = track;
  info.customData = {
    rocksky: { source: "uploaded", index, track: safeTrack },
  };
  const item = new chrome.cast.media.QueueItem(info);
  item.autoplay = true;
  item.preloadTime = 5;
  return item;
}
async function fill(
  tracks: QueueTrack[],
  index: number,
  target: cast.framework.CastSession,
  signal: AbortSignal,
) {
  try {
    await abortableDelay(250, signal);
    for (const [start, end, prepend] of [
      [index + 1, tracks.length, false],
      [0, index, true],
    ] as const) {
      const anchor = prepend
        ? media()?.items?.find((item) => trackData(item.media).index === index)
            ?.itemId
        : undefined;
      if (prepend && start < end && !anchor)
        throw new Error("Could not restore the start of the Cast queue.");
      for (let offset = start; offset < end; ) {
        const count = offset === start ? 1 : 5;
        const items: chrome.cast.media.QueueItem[] = [];
        for (let i = offset; i < Math.min(end, offset + count); i++) {
          if (signal.aborted) return;
          items.push(await itemFor(tracks[i], i, signal));
        }
        await serialize(async () => {
          if (signal.aborted || session() !== target) return;
          const m = target.getMediaSession();
          if (!m) throw new Error("Chromecast playback has ended.");
          const request = new chrome.cast.media.QueueInsertItemsRequest(items);
          if (anchor) request.insertBefore = anchor;
          await call<void>((ok, fail) => m.queueInsertItems(request, ok, fail));
        });
        offset += items.length;
        await abortableDelay(250, signal);
      }
    }
    if (!signal.aborted) await webCast.setRepeat(store.get(repeatModeAtom));
  } catch (error) {
    if (!signal.aborted) report(error);
  }
}
export const webCast = {
  active: () => store.get(playerAtom) === "cast" && !!session(),
  async connect() {
    if (!context) throw new Error("Chromecast is unavailable in this browser.");
    store.set(webCastAtom, (s) => ({ ...s, error: "" }));
    await context.requestSession();
  },
  disconnect() {
    job?.abort();
    context?.endCurrentSession(true);
  },
  async load(
    tracks: QueueTrack[],
    index: number,
    positionMs = 0,
    autoplay = true,
  ) {
    const target = session();
    if (!target) throw new Error("Select a Chromecast first.");
    if (!tracks[index]) throw new Error("This track is unavailable.");
    job?.abort();
    job = new AbortController();
    const signal = job.signal;
    const selected = await itemFor(tracks[index], index, signal);
    selected.autoplay = autoplay && positionMs === 0;
    await serialize(async () => {
      if (signal.aborted || session() !== target) throw castCancelled();
      const request = new chrome.cast.media.QueueLoadRequest([selected]);
      request.repeatMode =
        store.get(repeatModeAtom) === "one"
          ? chrome.cast.media.RepeatMode.SINGLE
          : chrome.cast.media.RepeatMode.OFF;
      await call<chrome.cast.media.Media>((ok, fail) =>
        target.getSessionObj().queueLoad(request, ok, fail),
      );
      if (signal.aborted || session() !== target) throw castCancelled();
      ownedQueue = tracks;
      resumedIndices = null;
      store.set(queueAtom, tracks);
      store.set(queueIndexAtom, index);
      store.set(playerAtom, "cast");
      if (positionMs > 0) {
        await this.seek(positionMs);
        if (autoplay) await this.play();
      }
      mirror();
    });
    void fill(tracks, index, target, signal);
  },
  async play() {
    const m = media();
    if (m)
      await call<void>((ok, fail) =>
        m.play(new chrome.cast.media.PlayRequest(), ok, fail),
      );
  },
  async pause() {
    const m = media();
    if (m)
      await call<void>((ok, fail) =>
        m.pause(new chrome.cast.media.PauseRequest(), ok, fail),
      );
  },
  async seek(ms: number) {
    const m = media();
    if (!m) return;
    const r = new chrome.cast.media.SeekRequest();
    r.currentTime = ms / 1000;
    await call<void>((ok, fail) => m.seek(r, ok, fail));
  },
  async volume(value: number) {
    await session()?.setVolume(Math.max(0, Math.min(1, value)));
  },
  async jump(index: number) {
    const m = media();
    const item = m?.items?.find(
      (item) =>
        trackData(item.media).index === (resumedIndices?.[index] ?? index),
    );
    if (m && item)
      await call<void>((ok, fail) => m.queueJumpToItem(item.itemId, ok, fail));
    else await this.load(store.get(queueAtom), index);
  },
  async next(delta: number) {
    const queue = store.get(queueAtom);
    let index = store.get(queueIndexAtom) + delta;
    if (store.get(repeatModeAtom) === "all")
      index = (index + queue.length) % queue.length;
    if (queue[index]) await this.jump(index);
  },
  async setRepeat(mode: RepeatMode) {
    const m = media();
    if (m)
      await call<void>((ok, fail) =>
        m.queueSetRepeatMode(repeat(mode), ok, fail),
      );
  },
  async enqueue(tracks: QueueTrack[], where: "next" | "last") {
    const queue = store.get(queueAtom),
      index = store.get(queueIndexAtom),
      np = store.get(nowPlayingAtom);
    if (!queue.length) return this.load(tracks, 0);
    const at = where === "next" ? index + 1 : queue.length;
    await this.load(
      [...queue.slice(0, at), ...tracks, ...queue.slice(at)],
      index,
      np?.progress,
      np?.isPlaying,
    );
  },
  async remove(index: number) {
    const queue = store.get(queueAtom),
      current = store.get(queueIndexAtom),
      np = store.get(nowPlayingAtom);
    if (index === current) return;
    await this.load(
      queue.filter((_, i) => i !== index),
      current - (index < current ? 1 : 0),
      np?.progress,
      np?.isPlaying,
    );
  },
  async reorder(queue: QueueTrack[], from: number, to: number) {
    const current = store.get(queueIndexAtom),
      np = store.get(nowPlayingAtom);
    const index =
      current === from
        ? to
        : from < current && to >= current
          ? current - 1
          : from > current && to <= current
            ? current + 1
            : current;
    await this.load(queue, index, np?.progress, np?.isPlaying);
  },
};

export function initializeWebCast() {
  if (initialized || !window.isSecureContext) return;
  initialized = true;
  const initialize = (available: boolean) => {
    if (!available || context) return;
    context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId:
        import.meta.env.VITE_GOOGLE_CAST_RECEIVER_APP_ID || "833D8703",
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    const availability = () =>
      store.set(webCastAtom, (s) => ({
        ...s,
        available:
          context!.getCastState() !==
          cast.framework.CastState.NO_DEVICES_AVAILABLE,
      }));
    context.addEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      availability,
    );
    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event) => {
        const target = session();
        if (
          event.sessionState === cast.framework.SessionState.SESSION_STARTED ||
          event.sessionState === cast.framework.SessionState.SESSION_RESUMED
        ) {
          if (!target) return;
          store.set(webCastAtom, {
            available: true,
            connected: true,
            name: target.getCastDevice().friendlyName,
            error: "",
          });
          const np = store.get(nowPlayingAtom);
          const local = getRockboxPlayer();
          if (local.ready) local.pause();
          store.set(playerAtom, "cast");
          if (
            event.sessionState === cast.framework.SessionState.SESSION_STARTED
          ) {
            const tracks = store.get(queueAtom);
            if (tracks.length)
              castAction(
                webCast.load(
                  tracks,
                  store.get(queueIndexAtom),
                  np?.progress,
                  np?.isPlaying,
                ),
              );
          } else {
            const items = target.getMediaSession()?.items ?? [];
            const tracks: QueueTrack[] = [];
            resumedIndices = [];
            for (const item of items) {
              const data = trackData(item.media);
              if (!data.track) continue;
              tracks.push({ ...data.track, streamUrl: item.media.contentId });
              resumedIndices.push(data.index ?? tracks.length - 1);
            }
            store.set(queueAtom, tracks);
            ownedQueue = null;
            mirror();
          }
        } else if (
          event.sessionState === cast.framework.SessionState.SESSION_ENDED
        ) {
          job?.abort();
          ownedQueue = null;
          resumedIndices = null;
          mimeCache.clear();
          store.set(webCastAtom, (s) => ({ ...s, connected: false }));
          if (store.get(playerAtom) === "cast") {
            const local = getRockboxPlayer();
            if (local.ready) local.setQueue([], false);
            store.set(playerAtom, "rockbox");
            store.set(nowPlayingAtom, (np) =>
              np ? { ...np, isPlaying: false } : null,
            );
          }
        }
      },
    );
    const remote = new cast.framework.RemotePlayer();
    const controller = new cast.framework.RemotePlayerController(remote);
    controller.addEventListener(
      cast.framework.RemotePlayerEventType.ANY_CHANGE,
      mirror,
    );
    window.setInterval(mirror, 1000);
    availability();
  };
  (
    window as Window & { __onGCastApiAvailable?: (available: boolean) => void }
  ).__onGCastApiAvailable = initialize;
  if (typeof cast !== "undefined" && cast.framework) initialize(true);
  else {
    const script = document.createElement("script");
    script.src =
      "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => {
      initialized = false;
    };
    document.head.appendChild(script);
  }
}
