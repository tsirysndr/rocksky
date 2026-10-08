import { atom, getDefaultStore } from "jotai";
import { Alert, NativeModules, Platform } from "react-native";
import type {
  CastSession,
  MediaQueueItem,
  MediaStatus,
  RemoteMediaClient,
} from "react-native-google-cast";
import { castFiles } from "../../modules/rocksky-cast";
import type { EngineCommand, EngineStatus } from "../../modules/rocksky-engine";
import type { UploadQueueTrack } from "./uploadEngine";
import { abortableDelay, castCancelled, castRequests } from "./castRequests";
import { storage } from "../storage";

export const castStateAtom = atom({
  connected: false,
  suspended: false,
  name: "Chromecast",
  remoteDeviceId: "",
});
const store = getDefaultStore();
// Do not load a native-only package in Expo Go, iOS, or older installed binaries.
export const isCastAvailable =
  Platform.OS === "android" && !!NativeModules.RNGCCastContext;
export const castSdk: typeof import("react-native-google-cast") | null =
  isCastAvailable ? require("react-native-google-cast") : null;

let client: RemoteMediaClient | null = null;
let subscriptions: { remove(): void }[] = [];
export type CastPathResolver = (
  track: UploadQueueTrack,
  index: number,
  signal: AbortSignal,
) => Promise<string>;
type QueueSource = {
  tracks: UploadQueueTrack[];
  paths: string[] | CastPathResolver;
  prepared: Map<number, MediaQueueItem>;
  inserted: Set<number>;
  files: Map<string, ReturnType<typeof castFiles.share>>;
  order: number[];
};
let source: QueueSource | null = null;
let loading: AbortController | null = null;
function cancelPreparation() {
  loading?.abort();
  loading = null;
}
let status: EngineStatus = {
  ok: true,
  state: "paused",
  index: null,
  positionMs: 0,
  durationMs: 0,
  queueLen: 0,
  shuffle: false,
  repeat: "off",
  volume: 1,
};
let lastPositionAt = Date.now();
let onDisconnected = () => {};
let pending = Promise.resolve();
let generation = 0;
let advancing = false;
const contentTypes = new Map<string, string>();

function report(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return;
  Alert.alert(
    "Chromecast",
    error instanceof Error
      ? error.message
      : "Could not control your Chromecast. Check the Wi-Fi connection and try again.",
  );
}
function update(media: MediaStatus | null) {
  if (!media) return;
  const previous = status;
  const data = media.mediaInfo?.customData as
    | { rocksky?: { index?: number } }
    | undefined;
  const index = data?.rocksky?.index;
  const nextIndex = Number.isInteger(index) ? index! : null;
  status = {
    ...status,
    state:
      media.playerState === "playing"
        ? "playing"
        : media.playerState === "idle"
          ? "stopped"
          : "paused",
    index: nextIndex,
    positionMs: (media.streamPosition || 0) * 1000,
    durationMs: (media.mediaInfo?.streamDuration || 0) * 1000,
    volume: media.volume,
  };
  lastPositionAt = Date.now();
  // A very short song can finish before its successor has been inserted.
  // Prioritize that successor instead of leaving a partially prepared queue idle.
  if (
    media.playerState === "idle" &&
    media.idleReason === "finished" &&
    previous.state !== "stopped" &&
    source &&
    previous.index !== null &&
    !advancing
  ) {
    const at = source.order.indexOf(previous.index);
    const next = source.order[at + 1];
    if (next !== undefined && !source.inserted.has(next)) {
      advancing = true;
      void reload(next, 0, true)
        .catch(report)
        .finally(() => {
          advancing = false;
        });
    }
  }
}
function transaction<T>(work: () => Promise<T>): Promise<T> {
  const current = generation;
  const result = pending.then(() => {
    if (current !== generation) throw new Error("Chromecast session changed.");
    return work();
  });
  pending = result.then(
    () => {},
    () => {},
  );
  return result;
}
function enqueue(work: () => Promise<unknown>) {
  void transaction(work).catch(report);
}
async function remoteContentType(
  track: UploadQueueTrack,
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  if (track.mimeType) return track.mimeType;
  const existing = contentTypes.get(url);
  if (existing) return existing;
  const request = (async () => {
    const response = await castRequests.fetch(url, { method: "HEAD", signal });
    const mime = response.headers.get("content-type")?.split(";")[0];
    if (
      response.ok &&
      mime &&
      (mime.startsWith("audio/") || mime === "application/ogg")
    )
      return mime;
    throw new Error(
      "Could not identify this track's audio format for Chromecast.",
    );
  })();
  const mime = await request;
  contentTypes.set(url, mime);
  return mime;
}
function repeatMode() {
  if (!castSdk) return undefined;
  return status.repeat === "one"
    ? castSdk.MediaRepeatMode.SINGLE
    : status.repeat === "all"
      ? castSdk.MediaRepeatMode.ALL
      : castSdk.MediaRepeatMode.OFF;
}
function queueOrder(length: number, index: number) {
  const order = Array.from({ length }, (_, i) => i);
  if (status.shuffle) {
    order.splice(index, 1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.unshift(index);
  }
  return order;
}
async function prepareOne(
  queue: QueueSource,
  index: number,
  signal: AbortSignal,
) {
  const cached = queue.prepared.get(index);
  if (cached) return cached;
  const track = queue.tracks[index];
  const path =
    typeof queue.paths === "function"
      ? await queue.paths(track, index, signal)
      : queue.paths[index];
  if (signal.aborted) throw castCancelled();
  const [item] = await castPlayback.prepare(
    [track],
    [path],
    signal,
    queue.files,
  );
  item.mediaInfo!.customData = {
    rocksky: {
      index, queuePosition: queue.order.indexOf(index) + 1, queueTotal: queue.tracks.length,
      source: track.localId ? "local" : "uploaded",
      track: { uploadId: track.localId ? undefined : track.uploadId,
        navidromeId: track.navidromeId, songUri: track.songUri, albumUri: track.albumUri },
    },
  };
  if (signal.aborted) throw castCancelled();
  queue.prepared.set(index, item);
  return item;
}
async function fillQueue(
  queue: QueueSource,
  index: number,
  target: RemoteMediaClient,
  signal: AbortSignal,
) {
  try {
    // Yield playback to the receiver before doing any work for other tracks.
    await abortableDelay(250, signal);
    const at = queue.order.indexOf(index);
    const append = queue.order
      .slice(at + 1)
      .filter((i) => !queue.inserted.has(i));
    const prepend = queue.order
      .slice(0, at)
      .filter((i) => !queue.inserted.has(i));
    for (const part of [append, prepend]) {
      let before: number | undefined;
      if (part === prepend && part.length) {
        const media = await target.getMediaStatus();
        before = media?.queueItems?.find(
          (item) =>
            (item.mediaInfo?.customData as { rocksky?: { index?: number } })
              ?.rocksky?.index === index,
        )?.itemId;
        if (!before && status.index === index) before = media?.currentItemId;
        if (!before)
          throw new Error("Could not restore earlier Chromecast queue items.");
      }
      for (let offset = 0; offset < part.length; ) {
        // Prepare the next three individually; never hold them behind a batch of probes.
        const size = offset < 3 ? 1 : 5;
        const batch: MediaQueueItem[] = [];
        for (const i of part.slice(offset, offset + size)) {
          if (signal.aborted) return;
          batch.push(await prepareOne(queue, i, signal));
        }
        await transaction(async () => {
          if (signal.aborted || client !== target) return;
          await target.queueInsertItems(batch, before);
          for (const i of part.slice(offset, offset + size))
            queue.inserted.add(i);
        });
        offset += batch.length;
        await abortableDelay(250, signal);
      }
    }
  } catch (error) {
    if (!signal.aborted && client === target) report(error);
  }
}
async function loadSource(
  queue: QueueSource,
  index: number,
  positionMs: number,
  autoplay: boolean,
) {
  if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length)
    throw new Error("Invalid Chromecast queue index.");
  const target = client;
  if (!target) throw new Error("Select a Chromecast first.");
  cancelPreparation();
  const controller = new AbortController();
  loading = controller;
  const signal = controller.signal;
  const previous = source;
  try {
    const selected = await prepareOne(queue, index, signal);
    await transaction(async () => {
      if (signal.aborted || client !== target) throw castCancelled();
      await target.loadMedia({
        autoplay,
        startTime: positionMs / 1000,
        queueData: {
          name: "Rocksky",
          items: [{ ...selected, autoplay }],
          startIndex: 0,
          startTime: positionMs / 1000,
          repeatMode: repeatMode(),
        },
      });
      if (signal.aborted || client !== target) throw castCancelled();
      source = queue;
      queue.inserted = new Set([index]);
      status = {
        ...status,
        index,
        positionMs,
        durationMs: queue.tracks[index].durationMs,
        state: autoplay ? "playing" : "paused",
        queueLen: queue.tracks.length,
      };
      lastPositionAt = Date.now();
    });
    void fillQueue(queue, index, target, signal);
  } catch (error) {
    if (
      !signal.aborted &&
      source === previous &&
      previous &&
      status.index !== null
    ) {
      loading = new AbortController();
      void fillQueue(previous, status.index, target, loading.signal);
    }
    throw error;
  }
}
async function reload(
  index = status.index ?? 0,
  positionMs = castPlayback.status().positionMs,
  autoplay = status.state === "playing",
) {
  if (source) await loadSource(source, index, positionMs, autoplay);
}
function jump(direction: number) {
  if (!source) return;
  const at = source.order.indexOf(status.index ?? 0);
  let next = at + direction;
  if (status.repeat === "all")
    next = (next + source.order.length) % source.order.length;
  if (next >= 0 && next < source.order.length)
    void reload(source.order[next], 0, true).catch(report);
}

export const castPlayback = {
  connected: () => !!client,
  hasLoadedQueue: () => source !== null && status.index !== null,
  available: () => isCastAvailable,
  status(): EngineStatus {
    const elapsed =
      status.state === "playing" ? Date.now() - lastPositionAt : 0;
    return {
      ...status,
      positionMs: Math.min(
        status.durationMs || Infinity,
        status.positionMs + elapsed,
      ),
    };
  },
  async prepare(
    tracks: UploadQueueTrack[],
    paths: string[],
    signal?: AbortSignal,
    files = new Map<string, ReturnType<typeof castFiles.share>>(),
  ): Promise<MediaQueueItem[]> {
    // Album artwork is commonly shared by hundreds of queue entries. Register
    // it once per preparation, rather than once per track across the bridge.
    const share = (path: string) => {
      let pendingFile = files.get(path);
      if (!pendingFile) {
        pendingFile = castFiles.share(path);
        files.set(path, pendingFile);
      }
      return pendingFile;
    };
    const items: MediaQueueItem[] = [];
    for (let i = 0; i < tracks.length; i++) {
      if (signal?.aborted) throw castCancelled();
      const track = tracks[i];
      const path = paths[i];
      if (!path) throw new Error("Audio file is unavailable.");
      const media = /^https?:\/\//i.test(path)
        ? {
            url: path,
            contentType: await remoteContentType(track, path, signal),
          }
        : await share(path);
      let cover = track.albumArt || "";
      if (cover && !/^https?:\/\//i.test(cover)) {
        try {
          cover = (await share(cover)).url;
        } catch {
          cover = "";
        }
      }
      items.push({
        autoplay: true,
        preloadTime: 20,
        mediaInfo: {
          contentUrl: media.url,
          contentId: media.url,
          contentType: media.contentType,
          streamDuration:
            track.durationMs > 0 ? track.durationMs / 1000 : undefined,
          streamType: castSdk?.MediaStreamType.BUFFERED,
          metadata: {
            type: "musicTrack",
            title: track.title,
            artist: track.artist,
            albumArtist: track.albumArtist,
            albumTitle: track.album,
            images: cover ? [{ url: cover }] : [],
          },
          customData: {
            rocksky: { index: i, source: track.localId ? "local" : "uploaded" },
          },
        },
      });
    }
    return items;
  },
  async load(
    tracks: UploadQueueTrack[],
    paths: string[] | CastPathResolver,
    index: number,
    positionMs = 0,
    autoplay = true,
  ) {
    await loadSource(
      {
        tracks,
        paths,
        prepared: new Map(),
        inserted: new Set(),
        files: new Map(),
        order: queueOrder(tracks.length, index),
      },
      index,
      positionMs,
      autoplay,
    );
  },
  command(command: EngineCommand) {
    if (command.cmd === "status") return this.status();
    if (!client)
      return { ok: false as const, error: "Chromecast is disconnected" };
    switch (command.cmd) {
      case "play":
        enqueue(() => client!.play());
        break;
      case "pause":
        enqueue(() => client!.pause());
        break;
      case "next":
        jump(1);
        break;
      case "previous":
        jump(-1);
        break;
      case "seek":
        enqueue(() => client!.seek({ position: command.positionMs / 1000 }));
        break;
      case "skipTo":
        void reload(command.index, 0, true).catch(report);
        break;
      case "stop":
        cancelPreparation();
        enqueue(() => client!.stop());
        status = { ...status, state: "stopped", index: null };
        break;
      case "setVolume":
        enqueue(() => client!.setStreamVolume(command.volume));
        break;
      case "setShuffle":
        status = { ...this.status(), shuffle: command.enabled };
        lastPositionAt = Date.now();
        if (source)
          source.order = queueOrder(source.tracks.length, status.index ?? 0);
        void reload().catch(report);
        break;
      case "setRepeat":
        status = { ...this.status(), repeat: command.mode };
        lastPositionAt = Date.now();
        void reload().catch(report);
        break;
      case "setAudioSettings":
        return {
          ok: false as const,
          error: "Audio processing is performed by the Chromecast",
        };
      default:
        return {
          ok: false as const,
          error: "Queue updates must use the Cast queue loader",
        };
    }
    return { ok: true as const };
  },
  async disconnect() {
    await castSdk?.default.getSessionManager().endCurrentSession(true);
  },
  start(
    onConnected: (resumed: boolean) => Promise<void>,
    disconnected: () => void,
  ) {
    if (!castSdk) return () => {};
    onDisconnected = disconnected;
    const manager = castSdk.default.getSessionManager();
    let detachRemote = () => {};
    const end = () => {
      detachRemote();
      generation++;
      cancelPreparation();
      client = null;
      contentTypes.clear();
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
      store.set(castStateAtom, {
        connected: false,
        suspended: false,
        name: "Chromecast",
        remoteDeviceId: "",
      });
      onDisconnected();
      source = null;
      status = {
        ...status,
        state: "paused",
        index: null,
        positionMs: 0,
        durationMs: 0,
        queueLen: 0,
      };
      lastPositionAt = Date.now();
      void castFiles.stop();
    };
    let running = true;
    const connect = async (session: CastSession, resumed: boolean) => {
      detachRemote();
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
      generation++;
      cancelPreparation();
      if (!resumed) source = null;
      client = session.client;
      const [device, media] = await Promise.all([
        session.getCastDevice(),
        client.getMediaStatus(),
      ]);
      if (!running || client !== session.client) return;
      update(media);
      store.set(castStateAtom, {
        connected: true,
        suspended: false,
        name: device?.friendlyName || "Chromecast",
        remoteDeviceId: "",
      });
      // Authorize the receiver itself. Credentials stay on a private Cast
      // channel, never in queue metadata or local-file URLs.
      const connectionGeneration = generation;
      void session.addChannel("urn:x-cast:app.rocksky.remote").then((channel) => {
        if (!running || connectionGeneration !== generation) { void channel.remove(); return; }
        let sentToken: string | null | undefined;
        channel.onMessage((payload) => {
          let message;
          try { message = typeof payload === "string" ? JSON.parse(payload) : payload; } catch { return; }
          if (message?.type === "registered" && typeof message.deviceId === "string")
            store.set(castStateAtom, (state) => ({ ...state, remoteDeviceId: message.deviceId }));
        });
        const authorize = () => {
          const token = storage.getToken();
          if (token === sentToken) return;
          sentToken = token;
          void channel.sendMessage(token
            ? { type: "authorize", token, name: device?.friendlyName || "Chromecast" }
            : { type: "disconnect" }).catch(() => { sentToken = undefined; });
        };
        authorize();
        const timer = setInterval(authorize, 5000);
        detachRemote = () => { clearInterval(timer); void channel.remove().catch(() => {}); };
      }).catch(() => { /* Older receivers still support ordinary Cast controls. */ });
      subscriptions = [
        client.onMediaStatusUpdated(update),
        client.onMediaProgressUpdated((progress, duration) => {
          status = {
            ...status,
            positionMs: progress * 1000,
            durationMs: duration * 1000,
          };
          lastPositionAt = Date.now();
        }, 1),
      ];
      await onConnected(resumed);
      if (resumed && source && status.index !== null && !loading) {
        loading = new AbortController();
        void fillQueue(source, status.index, session.client, loading.signal);
      }
    };
    const failed = async (error: unknown) => {
      report(error);
      try {
        await manager.endCurrentSession(true);
      } catch {
        end();
      }
    };
    const listeners = [
      manager.onSessionStarted((s) => void connect(s, false).catch(failed)),
      manager.onSessionResumed((s) => void connect(s, true).catch(failed)),
      manager.onSessionEnded(end),
      manager.onSessionSuspended(() => {
        store.set(castStateAtom, (previous) => ({
          ...previous,
          suspended: true,
        }));
        status = { ...this.status(), state: "paused" };
        lastPositionAt = Date.now();
      }),
      manager.onSessionStartFailed((_session, reason) =>
        report(new Error(reason)),
      ),
    ];
    void manager
      .getCurrentCastSession()
      .then((s) => {
        if (s && running && !client) return connect(s, true);
      })
      .catch(failed);
    return () => {
      running = false;
      detachRemote();
      listeners.forEach((s) => s.remove());
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
    };
  },
};
