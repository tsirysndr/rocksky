import { RemotePlayer, type RemoteQueueItem } from "@rocksky/sdk/remote";
import { readTrack } from "./receiver.ts";
import type { Player } from "./receiverUpdates.ts";
import type { QueueSyncContext } from "./queueSync.ts";
import { createRemoteEnqueue } from "./remoteEnqueue.ts";

export const REMOTE_NAMESPACE = "urn:x-cast:app.rocksky.remote";
export interface RemoteReceiverPlayer extends Player {
  sendLocalMediaRequest(request: Record<string, unknown>): void;
}
const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" ? (value as Record<string, any>) : {};

// Only public metadata goes to the remote protocol. Never publish a Cast
// contentId: it may contain a stream token or a local-file capability.
export function remoteQueueItem(value: unknown): RemoteQueueItem {
  const media = record(value);
  const custom = record(record(media.customData).rocksky);
  const saved = record(custom.track);
  const track = readTrack(media);
  const md = record(media.metadata);
  return {
    uploadId: custom.source === "local" ? undefined : saved.uploadId,
    trackId: saved.navidromeId,
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    album: track?.album,
    albumArtist: md.albumArtist,
    albumArt: track?.artwork?.startsWith("https://")
      ? track.artwork
      : undefined,
    durationMs: (track?.duration ?? 0) * 1000,
    songUri: saved.songUri,
    albumUri: saved.albumUri,
  };
}

/** The TV owns this socket; losing the Cast sender does not disconnect it. */
export function attachRemotePlayer(
  context: QueueSyncContext,
  player: RemoteReceiverPlayer,
  audio?: Pick<
    HTMLAudioElement,
    "readyState" | "currentTime" | "duration" | "volume"
  >,
  createPlayer = (options: ConstructorParameters<typeof RemotePlayer>[0]) =>
    new RemotePlayer(options),
) {
  let remote: RemotePlayer | null = null;
  let token = "";
  let name = "";
  let ownerSender = "";
  let queueKey = "";
  let lastStatus = "";
  let announcedId = "";
  let requestId = 0;
  const items = () => player.getQueueManager()?.getItems().map(record) ?? [];
  const index = () => player.getQueueManager()?.getCurrentItemIndex() ?? -1;
  const send = (type: string, fields: Record<string, unknown>) => {
    player.sendLocalMediaRequest({ type, requestId: ++requestId, ...fields });
  };
  const itemAt = (i: number) =>
    Number.isInteger(i) && i >= 0 ? items()[i] : undefined;
  const enqueuer = createRemoteEnqueue(
    () => token,
    send,
    () => items() as { itemId: number }[],
    index,
  );
  function publish() {
    if (!remote) return;
    const queue = items();
    const currentIndex = index();
    const current = queue[currentIndex]?.media ?? player.getMediaInformation();
    const track = readTrack(current);
    const state = player.getPlayerState();
    const status =
      state === "PLAYING"
        ? "playing"
        : state === "PAUSED" || state === "BUFFERING"
          ? "paused"
          : "stopped";
    if (track)
      remote.setNowPlaying({
        ...remoteQueueItem(current),
        durationMs:
          (audio && Number.isFinite(audio.duration)
            ? audio.duration
            : player.getDurationSec() || track.duration) * 1000,
        elapsedMs:
          Math.max(
            0,
            audio && audio.readyState >= 1
              ? audio.currentTime
              : player.getCurrentTimeSec(),
          ) * 1000,
        isPlaying: state === "PLAYING",
        volume: audio?.volume,
      });
    if (status !== lastStatus) {
      lastStatus = status;
      remote.setStatus(status);
    }
    const publicQueue = queue.map((item) => remoteQueueItem(item.media));
    const key = JSON.stringify([currentIndex, publicQueue]);
    if (key !== queueKey) {
      queueKey = key;
      remote.setQueue(publicQueue, Math.max(0, currentIndex));
    }
    if (remote.id && remote.id !== announcedId) {
      announcedId = remote.id;
      try {
        context.sendCustomMessage(REMOTE_NAMESPACE, ownerSender, {
          type: "registered",
          deviceId: remote.id,
        });
      } catch { /* The authorizing sender may already have closed. */ }
    }
  }
  function disconnect() {
    enqueuer.cancel();
    remote?.setStatus("stopped");
    remote?.disconnect();
    remote = null;
    token = "";
    queueKey = "";
    lastStatus = "";
    announcedId = "";
  }
  const listener = (event: { senderId: string; data: unknown }) => {
    let message;
    try {
      message = record(
        typeof event.data === "string" ? JSON.parse(event.data) : event.data,
      );
    } catch {
      return;
    }
    if (message.type === "disconnect" && event.senderId === ownerSender) {
      disconnect();
      return;
    }
    if (
      message.type !== "authorize" ||
      typeof message.token !== "string" ||
      !message.token
    )
      return;
    const nextName =
      typeof message.name === "string"
        ? message.name.slice(0, 100)
        : "Chromecast";
    ownerSender = event.senderId;
    if (message.token === token && nextName === name) {
      announcedId = "";
      publish();
      return;
    }
    disconnect();
    token = message.token;
    name = nextName;
    remote = createPlayer({ token: () => token || undefined, name });
    remote
      .on("play", () => player.play())
      .on("pause", () => player.pause())
      .on("enqueue", (command) => {
        void enqueuer.enqueue(command).catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError"))
            console.warn(
              "Rocksky remote enqueue failed; check upload availability.",
            );
        });
      })
      .on("seek", (ms) => {
        if (Number.isFinite(ms)) player.seek(Math.max(0, ms) / 1000);
      })
      .on("next", () => send("QUEUE_UPDATE", { jump: 1 }))
      .on("previous", () => send("QUEUE_UPDATE", { jump: -1 }))
      .on("queueJump", (i) => {
        const item = itemAt(i);
        if (item) send("QUEUE_UPDATE", { currentItemId: item.itemId });
      })
      .on("queueRemove", (i) => {
        const item = itemAt(i);
        if (item) send("QUEUE_REMOVE", { itemIds: [item.itemId] });
      })
      .on("queueMove", (from, to) => {
        const queue = items();
        if (!itemAt(from) || !itemAt(to) || from === to) return;
        const [moved] = queue.splice(from, 1);
        queue.splice(to, 0, moved);
        send("QUEUE_REORDER", {
          itemIds: [moved.itemId],
          insertBefore: queue[to + 1]?.itemId,
        });
      })
      .on("setRepeat", (mode) =>
        send("QUEUE_UPDATE", {
          repeatMode:
            mode === "one"
              ? "REPEAT_SINGLE"
              : mode === "all"
                ? "REPEAT_ALL"
                : "REPEAT_OFF",
        }),
      )
      .on("setVolume", (volume) => {
        if (audio && Number.isFinite(volume))
          audio.volume = Math.max(0, Math.min(1, volume));
      });
    publish();
    remote.connect();
  };
  context.addCustomMessageListener(REMOTE_NAMESPACE, listener);
  const timer = setInterval(publish, 2000);
  return () => {
    clearInterval(timer);
    context.removeCustomMessageListener(REMOTE_NAMESPACE, listener);
    disconnect();
  };
}
