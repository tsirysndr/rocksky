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
import { mapConcurrent } from "./mapConcurrent";

export const castStateAtom = atom({
  connected: false,
  suspended: false,
  name: "Chromecast",
});
const store = getDefaultStore();
// Do not load a native-only package in Expo Go, iOS, or older installed binaries.
export const isCastAvailable =
  Platform.OS === "android" && !!NativeModules.RNGCCastContext;
export const castSdk: typeof import("react-native-google-cast") | null =
  isCastAvailable ? require("react-native-google-cast") : null;

let client: RemoteMediaClient | null = null;
let subscriptions: { remove(): void }[] = [];
let entries: MediaQueueItem[] = [];
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
const contentTypes = new Map<string, Promise<string>>();

function report(error: unknown) {
  Alert.alert(
    "Chromecast",
    error instanceof Error
      ? error.message
      : "Could not control your Chromecast. Check the Wi-Fi connection and try again.",
  );
}
function update(media: MediaStatus | null) {
  if (!media) return;
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
): Promise<string> {
  if (track.mimeType) return track.mimeType;
  const existing = contentTypes.get(url);
  if (existing) return existing;
  const request = probeContentType(url);
  contentTypes.set(url, request);
  void request.catch(() => {
    if (contentTypes.get(url) === request) contentTypes.delete(url);
  });
  return request;
}
async function probeContentType(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
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
  } finally {
    clearTimeout(timeout);
  }
}
function repeatMode() {
  if (!castSdk) return undefined;
  return status.repeat === "one"
    ? castSdk.MediaRepeatMode.SINGLE
    : status.repeat === "all"
      ? castSdk.MediaRepeatMode.ALL
      : castSdk.MediaRepeatMode.OFF;
}
async function reload(
  index = status.index ?? 0,
  positionMs = castPlayback.status().positionMs,
  autoplay = status.state === "playing",
) {
  const target = client;
  if (!target || entries.length === 0) return;
  const order = entries.map((_, i) => i);
  if (status.shuffle) {
    // Keep the selected track first, then randomize the remainder once per load.
    order.splice(order.indexOf(index), 1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.unshift(index);
  }
  await target.loadMedia({
    autoplay,
    startTime: positionMs / 1000,
    queueData: {
      name: "Rocksky",
      items: order.map((i) => ({
        ...entries[i],
        autoplay: i === index ? autoplay : true,
      })),
      startIndex: order.indexOf(index),
      startTime: positionMs / 1000,
      repeatMode: repeatMode(),
    },
  });
  if (client !== target) return;
  status = {
    ...status,
    index,
    positionMs,
    state: autoplay ? "playing" : "paused",
    queueLen: entries.length,
  };
  lastPositionAt = Date.now();
}

export const castPlayback = {
  connected: () => !!client,
  hasLoadedQueue: () => entries.length > 0 && status.index !== null,
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
  ): Promise<MediaQueueItem[]> {
    // Album artwork is commonly shared by hundreds of queue entries. Register
    // it once per preparation, rather than once per track across the bridge.
    const files = new Map<string, ReturnType<typeof castFiles.share>>();
    const share = (path: string) => {
      let pendingFile = files.get(path);
      if (!pendingFile) {
        pendingFile = castFiles.share(path);
        files.set(path, pendingFile);
      }
      return pendingFile;
    };
    return mapConcurrent(tracks, async (track, i): Promise<MediaQueueItem> => {
      const path = paths[i];
      if (!path) throw new Error("Audio file is unavailable.");
      const media = /^https?:\/\//i.test(path)
        ? { url: path, contentType: await remoteContentType(track, path) }
        : await share(path);
      let cover = track.albumArt || "";
      if (cover && !/^https?:\/\//i.test(cover)) {
        try {
          cover = (await share(cover)).url;
        } catch {
          cover = "";
        }
      }
      return {
        autoplay: true,
        preloadTime: 5,
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
      };
    });
  },
  async load(
    tracks: UploadQueueTrack[],
    paths: string[],
    index: number,
    positionMs = 0,
    autoplay = true,
  ) {
    if (!client) throw new Error("Select a Chromecast first.");
    const target = client;
    await transaction(async () => {
      const prepared = await this.prepare(tracks, paths);
      if (client !== target)
        throw new Error("Chromecast disconnected while preparing music.");
      const previous = entries;
      entries = prepared;
      try {
        await reload(index, positionMs, autoplay);
      } catch (error) {
        entries = previous;
        throw error;
      }
    });
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
        enqueue(() => client!.queueNext());
        break;
      case "previous":
        enqueue(() => client!.queuePrev());
        break;
      case "seek":
        enqueue(() => client!.seek({ position: command.positionMs / 1000 }));
        break;
      case "skipTo":
        enqueue(() => reload(command.index, 0, true));
        break;
      case "stop":
        enqueue(() => client!.stop());
        status = { ...status, state: "stopped", index: null };
        break;
      case "setVolume":
        enqueue(() => client!.setStreamVolume(command.volume));
        break;
      case "setShuffle":
        status = { ...this.status(), shuffle: command.enabled };
        lastPositionAt = Date.now();
        enqueue(() => reload());
        break;
      case "setRepeat":
        status = { ...this.status(), repeat: command.mode };
        lastPositionAt = Date.now();
        enqueue(() => reload());
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
    const end = () => {
      generation++;
      client = null;
      contentTypes.clear();
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
      store.set(castStateAtom, {
        connected: false,
        suspended: false,
        name: "Chromecast",
      });
      onDisconnected();
      entries = [];
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
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
      generation++;
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
      });
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
      listeners.forEach((s) => s.remove());
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
    };
  },
};
