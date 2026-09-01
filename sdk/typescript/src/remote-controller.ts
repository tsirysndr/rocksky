/**
 * RemoteController — build a Rocksky remote UI in a few lines.
 *
 * The other half of the remote-control WebSocket protocol (see
 * remote-ws/PROTOCOL.md): where {@link RemotePlayer} is a controllable player, a
 * controller lists the user's players, observes what each is playing
 * (now-playing / status / queue), picks the primary device, and sends commands
 * (play/pause/next/previous/seek/queue actions/enqueue). Heartbeat, reconnect,
 * and the register handshake are handled for you.
 *
 * ```ts
 * const controller = new RemoteController({ token, name: "My Controller" });
 * controller.on("devices", (d) => render(d.devices));
 * controller.on("nowPlaying", (e) => showTrack(e.deviceId, e.track));
 * controller.connect();
 * // …then drive a device:
 * controller.setPrimary(deviceId);
 * controller.pause(deviceId);
 * controller.seek(deviceId, 42000);
 * ```
 */

import {
  DEFAULT_REMOTE_WS,
  type RemoteAudioSettings,
  type RemoteNowPlaying,
  type RemoteQueueItem,
  type RemoteRepeat,
} from "./remote-player.js";

export { DEFAULT_REMOTE_WS, type RemoteNowPlaying, type RemoteQueueItem };

/** A player device visible to the controller. */
export interface RemoteDevice {
  deviceId: string;
  name: string;
  nowPlaying?: RemoteNowPlaying;
  queueIndex: number;
  queue: RemoteQueueItem[];
}

/** Transport state advertised by a device. */
export type RemoteStatus = "playing" | "paused" | "stopped";

/** Events the controller emits (from the server). */
export interface RemoteControllerEvents {
  /** The full device snapshot (on connect + reconnect). */
  devices(payload: { primaryDevice: string | null; devices: RemoteDevice[] }): void;
  deviceRegistered(payload: { deviceId: string; name: string }): void;
  deviceUnregistered(payload: { deviceId: string }): void;
  primaryChanged(payload: { deviceId: string }): void;
  nowPlaying(payload: { deviceId: string; deviceName: string; track: RemoteNowPlaying }): void;
  status(payload: { deviceId: string; deviceName: string; status: RemoteStatus }): void;
  queue(payload: {
    deviceId: string;
    deviceName: string;
    index: number;
    queue: RemoteQueueItem[];
  }): void;
}

type EventName = keyof RemoteControllerEvents;
type EventHandler<K extends EventName> = RemoteControllerEvents[K];

export interface RemoteControllerOptions {
  /** Rocksky access token, or a getter (read fresh on each (re)connect/send). */
  token: string | (() => string | undefined);
  /** Registration label (controllers are hidden from device lists). */
  name: string;
  /** WebSocket endpoint. Defaults to {@link DEFAULT_REMOTE_WS}. */
  url?: string;
  /** Heartbeat interval, ms (default 10000). */
  heartbeatMs?: number;
  /** Reconnect delay after a drop, ms (default 3000). */
  reconnectMs?: number;
  /** Optional debug logger. */
  debug?: (...args: unknown[]) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export class RemoteController {
  private ws: WebSocket | null = null;
  private stopped = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private readonly url: string;
  private readonly heartbeatMs: number;
  private readonly reconnectMs: number;
  private readonly getToken: () => string | undefined;
  private readonly debug: (...args: unknown[]) => void;

  private handlers: { [K in EventName]?: EventHandler<K> } = {};

  constructor(private readonly opts: RemoteControllerOptions) {
    this.url = opts.url ?? DEFAULT_REMOTE_WS;
    this.heartbeatMs = opts.heartbeatMs ?? 10_000;
    this.reconnectMs = opts.reconnectMs ?? 3_000;
    this.getToken =
      typeof opts.token === "function" ? opts.token : () => opts.token as string;
    this.debug = opts.debug ?? (() => {});
  }

  /** Subscribe to a server event. Returns `this` for chaining. */
  on<K extends EventName>(event: K, handler: EventHandler<K>): this {
    this.handlers[event] = handler;
    return this;
  }

  /** Connect, register, and start the heartbeat + auto-reconnect loop. */
  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Tear the connection down and stop reconnecting. */
  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  /** Choose the primary (scrobble/profile) device. */
  setPrimary(deviceId: string): void {
    this.send({ type: "set_primary", device_id: deviceId, token: this.getToken() });
  }

  /** `play`. `target` is a device id, or omit to broadcast to all devices. */
  play(target?: string): void {
    this.command("play", target);
  }

  pause(target?: string): void {
    this.command("pause", target);
  }

  next(target?: string): void {
    this.command("next", target);
  }

  previous(target?: string): void {
    this.command("previous", target);
  }

  seek(target: string | undefined, positionMs: number): void {
    this.command("seek", target, { position: positionMs });
  }

  queueJump(target: string | undefined, index: number): void {
    this.command("queue_jump", target, { index });
  }

  queueRemove(target: string | undefined, index: number): void {
    this.command("queue_remove", target, { index });
  }

  /** Enqueue tracks on the target device. */
  enqueue(
    target: string | undefined,
    tracks: RemoteQueueItem[],
    mode: "now" | "next" | "last" = "now",
    shuffle = false,
    startIndex = 0,
  ): void {
    this.command("enqueue", target, {
      tracks: tracks.map((t) => ({
        uploadId: t.uploadId,
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        album_artist: t.albumArtist,
        album_art: t.albumArt,
        duration: t.durationMs,
        song_uri: t.songUri,
        album_uri: t.albumUri,
        track_number: t.trackNumber,
      })),
      mode,
      shuffle,
      startIndex,
    });
  }

  /** Turn queue shuffle on/off. A player without shuffle ignores it. */
  setShuffle(target: string | undefined, enabled: boolean): void {
    this.command("shuffle", target, { enabled });
  }

  /** Set the queue repeat mode. A player without repeat ignores it. */
  setRepeat(target: string | undefined, mode: RemoteRepeat): void {
    this.command("repeat", target, { mode });
  }

  /** Set output volume, 0–1. A player without volume control ignores it. */
  setVolume(target: string | undefined, volume: number): void {
    this.command("volume", target, {
      volume: Math.min(1, Math.max(0, volume)),
    });
  }

  /**
   * Apply a partial audio-settings document. Safe to send verbatim to any
   * device: every section is optional and a player applies only the ones its
   * engine implements, so there is nothing to probe or negotiate first.
   */
  setAudioSettings(
    target: string | undefined,
    settings: RemoteAudioSettings,
  ): void {
    this.command("audio_settings", target, settings as unknown as Json);
  }

  /** Send an arbitrary command (escape hatch). */
  command(action: string, target?: string, args?: Json): void {
    const payload: Json = { type: "command", action, token: this.getToken() };
    if (target) payload.target = target;
    if (args !== undefined) payload.args = args;
    this.send(payload);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private send(payload: Json): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        this.debug("send error", e);
      }
    }
  }

  private open(): void {
    if (this.stopped) return;
    const token = this.getToken();
    if (!token) {
      this.reconnectTimer = setTimeout(() => this.open(), this.reconnectMs);
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.debug("connect failed", e);
      this.reconnectTimer = setTimeout(() => this.open(), this.reconnectMs);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.debug("connected");
      this.send({ type: "register", clientName: this.opts.name, token: this.getToken() });
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, this.heartbeatMs);
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data === "pong") return;
      let msg: Json;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      this.debug("disconnected");
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.open(), this.reconnectMs);
      }
    };
  }

  private handle(msg: Json): void {
    // The registration reply carries no event (a controller doesn't need its own
    // id to control other devices).
    if (msg.status === "registered") return;
    switch (msg.type) {
      case "devices":
        this.handlers.devices?.({
          primaryDevice: msg.primary_device ?? null,
          devices: (msg.devices ?? []).map(deviceFromJson),
        });
        break;
      case "device_registered":
        this.handlers.deviceRegistered?.({
          deviceId: msg.deviceId ?? "",
          name: msg.clientName ?? "",
        });
        break;
      case "device_unregistered":
        this.handlers.deviceUnregistered?.({ deviceId: msg.device_id ?? "" });
        break;
      case "primary_changed":
        this.handlers.primaryChanged?.({ deviceId: msg.device_id ?? "" });
        break;
      case "message":
        this.handleMessage(msg);
        break;
      default:
        this.debug("unknown frame", msg.type);
    }
  }

  private handleMessage(msg: Json): void {
    const deviceId = msg.device_id ?? "";
    const deviceName = msg.device_name ?? "";
    const data = msg.data;
    if (!data) return;
    switch (data.type) {
      case "track":
        this.handlers.nowPlaying?.({ deviceId, deviceName, track: trackFromJson(data) });
        break;
      case "status":
        this.handlers.status?.({ deviceId, deviceName, status: statusFromCode(data.status) });
        break;
      case "queue":
        this.handlers.queue?.({
          deviceId,
          deviceName,
          index: data.index ?? 0,
          queue: (data.queue ?? []).map(queueItemFromJson),
        });
        break;
    }
  }
}

function statusFromCode(code: number): RemoteStatus {
  return code === 1 ? "playing" : code === 0 ? "stopped" : "paused";
}

function trackFromJson(d: Json): RemoteNowPlaying {
  return {
    title: d.title ?? "",
    artist: d.artist ?? "",
    album: d.album,
    albumArtist: d.album_artist,
    albumArt: d.album_art,
    durationMs: d.duration_ms ?? d.length,
    elapsedMs: d.elapsed,
    isPlaying: d.is_playing,
    codec: d.codec,
    sampleRate: d.sample_rate,
    // Server-enriched fields (present on the broadcast a controller receives).
    songUri: d.song_uri,
    albumUri: d.album_uri,
    artistUri: d.artist_uri,
    sha256: d.sha256,
    liked: d.liked,
  };
}

function queueItemFromJson(d: Json): RemoteQueueItem {
  return {
    uploadId: d.uploadId,
    trackId: d.trackId,
    title: d.title ?? "",
    artist: d.artist ?? "",
    album: d.album,
    albumArtist: d.album_artist,
    albumArt: d.album_art,
    durationMs: d.duration,
    songUri: d.song_uri,
    albumUri: d.album_uri,
    trackNumber: d.track_number,
  };
}

function deviceFromJson(d: Json): RemoteDevice {
  return {
    deviceId: d.device_id ?? "",
    name: d.name ?? "",
    nowPlaying: d.now_playing ? trackFromJson(d.now_playing) : undefined,
    queueIndex: d.queue?.index ?? 0,
    queue: (d.queue?.queue ?? []).map(queueItemFromJson),
  };
}
