// Rocksky remote: makes the CLI player a controllable WebSocket device on the
// Rocksky relay (GET /ws), exactly like the Rust `connect` daemon and the
// browser miniplayers. It
//   • registers as "Rocksky CLI" using the cached access token,
//   • pushes now-playing (track) + transport (status) + queue from
//     `playerController`,
//   • executes play/pause/next/previous/seek and the queue / context-menu
//     commands sent from the web/mobile miniplayers.
//
// The register handshake, heartbeat, auto-reconnect, device-id capture, and
// state resync are all handled by `@rocksky/sdk`'s `RemotePlayer`; this module
// is just the bridge between that and the CLI's `playerController`.
//
// Deliberately silent on stdout: the TUI renders with Ink, so any console
// output would corrupt the screen. Set ROCKSKY_WS_DEBUG=1 for stderr tracing.

import {
  RemotePlayer,
  type EnqueueCommand,
  type RemoteQueueItem,
} from "@rocksky/sdk/remote";
import { ROCKSKY_API_URL } from "client";
import {
  enqueueLast,
  enqueueNext,
  jumpTo,
  skipNext,
  skipPrev,
  streamAndPlay,
} from "./playback";
import { playerController, type QueueItem } from "./player";
import { loadSettings } from "./settings";

// An `enqueue` command's track (resolved by the miniplayer) → the CLI's
// QueueItem, so we can stream it via uploadId or trackId.
function remoteItemToQueueItem(d: RemoteQueueItem): QueueItem {
  return {
    uploadId: d.uploadId ?? "",
    trackId: d.trackId,
    title: d.title ?? "",
    artist: d.artist ?? "",
    album: d.album,
    albumArtist: d.albumArtist,
    albumArt: d.albumArt,
    duration: d.durationMs,
    uri: d.songUri,
    albumUri: d.albumUri,
  };
}

// Fisher–Yates shuffle (for "play shuffled album" / "add shuffled album").
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const WS_URL =
  process.env.ROCKSKY_WS || `${ROCKSKY_API_URL.replace(/^http/, "ws")}/ws`;

// How often we tick the push loop, and how often we re-push the current track so
// remote elapsed can't drift far from ours (the miniplayers tick progress
// locally between our pushes and reconcile on each one).
const PUSH_INTERVAL_MS = 1000;
const TRACK_REPUSH_MS = 4000;

function debug(...args: unknown[]) {
  if (process.env.ROCKSKY_WS_DEBUG) console.error("[rocksky-ws]", ...args);
}

export interface RockskyRemote {
  stop(): void;
}

/**
 * Connect the shared `playerController` to the Rocksky relay via the SDK's
 * `RemotePlayer`. `getToken` is read on every (re)connect/send so a login
 * mid-session takes effect and a logout stops traffic. Returns a handle whose
 * `stop()` tears the connection down.
 */
export function startRockskyRemote(
  getToken: () => string | undefined,
): RockskyRemote {
  if (process.env.ROCKSKY_NO_REMOTE) {
    return { stop() {} };
  }

  // The advertised name is configurable via ~/.rocksky/settings.toml
  // ([remote] name = "…"), read once at startup.
  const player = new RemotePlayer({
    token: getToken,
    name: loadSettings().remote.name,
    url: WS_URL,
    debug,
  });

  // Last state we advertised, so we only push on change (plus the re-push
  // timer) rather than re-sending identical frames every tick.
  let lastStatus: "stopped" | "playing" | "paused" | "" = "";
  let lastTrackKey = "";
  let lastTrackPushAt = 0;
  let lastQueueKey = "";
  let pushTimer: ReturnType<typeof setInterval> | undefined;

  // Advertise the current now-playing track. `force` bypasses the change /
  // interval gates (used right after a command so clients update fast).
  const pushTrack = (force = false) => {
    const status = playerController.status();
    const item = playerController.currentItem();
    if (!status || !item || status.state === "stopped") return;

    const durationMs = status.duration_ms || item.duration || 0;
    const elapsedMs = status.position_ms || 0;
    const key = `${item.title}|${item.artist}|${item.album ?? ""}|${status.index}`;
    const now = Date.now();
    if (!force && key === lastTrackKey && now - lastTrackPushAt < TRACK_REPUSH_MS)
      return;
    lastTrackKey = key;
    lastTrackPushAt = now;

    player.setNowPlaying({
      title: item.title,
      artist: item.artist,
      album: item.album,
      albumArtist: item.albumArtist || item.artist,
      albumArt: item.albumArt,
      durationMs,
      elapsedMs,
      isPlaying: status.state === "playing",
      // Decoder-probed audio info, shown as neon badges in the miniplayers.
      codec: status.metadata?.codec || undefined,
      sampleRate: status.metadata?.sample_rate || undefined,
    });
  };

  // Advertise the real playback queue + current index. Deduped by contents +
  // index; `force` bypasses it.
  const pushQueue = (force = false) => {
    const status = playerController.status();
    const items = playerController.queueItems;
    const index = status?.index ?? 0;
    const key = `${index}|${items
      .map((t) => t.uploadId || t.trackId || t.title)
      .join(",")}`;
    if (!force && key === lastQueueKey) return;
    lastQueueKey = key;

    player.setQueue(
      items.map((t) => ({
        uploadId: t.uploadId,
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArtist: t.albumArtist,
        albumArt: t.albumArt,
        durationMs: t.duration,
        songUri: t.uri,
        albumUri: t.albumUri,
        trackNumber: t.trackNumber,
      })),
      index,
    );
  };

  // One tick: emit status transitions immediately, and the current track on
  // change or every TRACK_REPUSH_MS while playing. Queue is deduped internally.
  const tick = () => {
    const state = playerController.status()?.state ?? "stopped";
    if (state !== lastStatus) {
      lastStatus = state;
      player.setStatus(state);
      if (state === "stopped") lastTrackKey = ""; // force a fresh push on resume
    }
    if (state !== "stopped") pushTrack();
    pushQueue();
  };

  // Reflect new state to every device right after a command, without waiting for
  // the next tick.
  const reflect = () => {
    lastStatus = "";
    setTimeout(() => {
      tick();
      pushTrack(true);
      pushQueue(true);
    }, 50);
  };

  player
    .on("play", () => {
      playerController.play();
      reflect();
    })
    .on("pause", () => {
      playerController.pause();
      reflect();
    })
    .on("next", async () => {
      const token = getToken();
      if (token) await skipNext(token);
      else playerController.next();
      reflect();
    })
    .on("previous", async () => {
      const token = getToken();
      if (token) await skipPrev(token);
      else playerController.previous();
      reflect();
    })
    .on("seek", (positionMs) => {
      playerController.seekMs(positionMs);
      reflect();
    })
    .on("queueJump", async (index) => {
      const token = getToken();
      if (token) await jumpTo(token, index);
      else playerController.skipTo(index);
      reflect();
    })
    .on("queueRemove", (index) => {
      playerController.removeAt(index);
      reflect();
    })
    // Context-menu play / enqueue (a track or a whole album).
    .on("enqueue", async (cmd: EnqueueCommand) => {
      const token = getToken();
      if (!token) return;
      let items = cmd.tracks.map(remoteItemToQueueItem);
      if (items.length === 0) return;
      if (cmd.shuffle) items = shuffled(items);
      switch (cmd.mode) {
        case "next":
          await enqueueNext(token, items);
          break;
        case "last":
          await enqueueLast(token, items);
          break;
        default:
          await streamAndPlay(token, items, cmd.shuffle ? 0 : cmd.startIndex);
      }
      reflect();
    });

  player.connect();

  // Drive our state onto the relay on our own cadence. The SDK no-ops sends
  // while disconnected and resyncs the last track/status/queue on (re)register,
  // so it's safe to start pushing immediately.
  tick();
  pushTrack(true);
  pushQueue(true);
  pushTimer = setInterval(tick, PUSH_INTERVAL_MS);

  return {
    stop() {
      if (pushTimer) clearInterval(pushTimer);
      player.disconnect();
    },
  };
}
