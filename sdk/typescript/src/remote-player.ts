/**
 * RemotePlayer — build a Rocksky-controllable player in a few lines.
 *
 * It speaks the remote-control WebSocket protocol (see remote-ws/PROTOCOL.md):
 * it registers as a device, advertises what you're playing (now-playing, status,
 * queue), and invokes your handlers when a miniplayer sends a command
 * (play/pause/next/previous/seek/enqueue/queue actions). Heartbeat, reconnect,
 * and the device-id handshake are handled for you.
 *
 * ```ts
 * const player = new RemotePlayer({ token, name: "My Player" });
 * player.on("play", () => engine.play());
 * player.on("pause", () => engine.pause());
 * player.on("next", () => engine.next());
 * player.on("seek", (ms) => engine.seek(ms));
 * player.connect();
 * // …then, as your engine plays:
 * player.setNowPlaying({ title, artist, album, albumArt, durationMs, elapsedMs, isPlaying: true });
 * player.setStatus("playing");
 * player.setQueue(items, index);
 * ```
 */

/** Default remote-control WebSocket endpoint. */
export const DEFAULT_REMOTE_WS = "wss://api.rocksky.app/ws";

/** Now-playing state you advertise. */
export interface RemoteNowPlaying {
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  /** Total track length, ms. */
  durationMs?: number;
  /** Current position, ms. */
  elapsedMs?: number;
  isPlaying?: boolean;
  /** Audio codec / container of the playing file (e.g. "mp3", "flac"),
   *  when the player knows it. Shown as a format badge by controller UIs. */
  codec?: string;
  /** Audio sample rate in Hz (e.g. 44100), when the player knows it. */
  sampleRate?: number;
  /** Queue shuffle state. Leave undefined when the player has no shuffle —
   *  that is how a controller tells "no such control" from "off", and hides
   *  the toggle instead of rendering it wrong. */
  shuffle?: boolean;
  /** Queue repeat mode. Undefined when the player has none. */
  repeat?: RemoteRepeat;
  /** Output volume 0–1. Undefined when the player has no volume control. */
  volume?: number;
  // The following are filled in by the server on the broadcast a controller
  // receives (a player leaves them unset — the server resolves them from the
  // library). They let a controller UI deep-link and show like state.
  /** The song's `at://` URI. */
  songUri?: string;
  /** The album's `at://` URI. */
  albumUri?: string;
  /** The artist's `at://` URI. */
  artistUri?: string;
  /** Content hash (matches the server's `sha256`). */
  sha256?: string;
  /** Whether the current user has liked this track. */
  liked?: boolean;
}

/** Queue repeat mode. */
export type RemoteRepeat = "off" | "all" | "one";

/**
 * A partial audio-settings document (protocol §6.1).
 *
 * Every section, and every field in it, is optional — a controller sends only
 * what it wants changed, and a player applies only the sections its engine
 * implements and ignores the rest. Units are the lexicon's: tenths of a dB for
 * EQ gain/precut and ReplayGain preamp, Q x10, milliseconds for fade times.
 */
export interface RemoteAudioSettings {
  equalizer?: {
    enabled?: boolean;
    /** Tenths of a dB, <= 0. */
    precut?: number;
    /** Positional — index 0 is the lowest band. */
    bands?: { frequency: number; gain: number; q: number }[];
  };
  tone?: {
    /** Whole dB. */
    bass?: number;
    /** Whole dB. */
    treble?: number;
    bassCutoff?: number;
    trebleCutoff?: number;
    /** Percent, -100 (left) to 100 (right). */
    balance?: number;
    channels?:
      | "stereo"
      | "mono"
      | "custom"
      | "monoLeft"
      | "monoRight"
      | "karaoke"
      | "swap";
    /** Percent. Only meaningful with `channels: "custom"`. */
    stereoWidth?: number;
  };
  crossfade?: {
    mode?: "off" | "enabled" | "shuffle" | "albumChange" | "trackChange";
    /** Milliseconds. */
    fadeInDelay?: number;
    fadeInDuration?: number;
    fadeOutDelay?: number;
    fadeOutDuration?: number;
    fadeOutMixMode?: "crossfade" | "mix";
  };
  replayGain?: {
    mode?: "off" | "track" | "album" | "trackIfShuffling";
    /** Tenths of a dB. */
    preamp?: number;
    preventClipping?: boolean;
  };
  crossfeed?: {
    mode?: "off" | "meier" | "custom";
    /** Tenths of a dB. */
    directGain?: number;
    crossGain?: number;
    highFrequencyGain?: number;
    /** Hz. */
    cutoff?: number;
  };
  compressor?: {
    threshold?: number;
    makeup?: number;
    ratio?: number;
    knee?: number;
    /** Milliseconds. */
    attack?: number;
    release?: number;
  };
  surround?: {
    /** Milliseconds. */
    delay?: number;
    balance?: number;
    fx1?: number;
    fx2?: number;
  };
  pbe?: {
    /** Percent. */
    strength?: number;
    /** Tenths of a dB. */
    precut?: number;
  };
}

/** One queue entry. `uploadId` (Rocksky uploads) or `trackId` (Navidrome id). */
export interface RemoteQueueItem {
  uploadId?: string;
  trackId?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  durationMs?: number;
  songUri?: string;
  albumUri?: string;
  trackNumber?: number;
}

/** Payload of an `enqueue` command from a controller (an album or a track). */
export interface EnqueueCommand {
  tracks: RemoteQueueItem[];
  mode: "now" | "next" | "last";
  shuffle: boolean;
  startIndex: number;
}

/** Handlers for commands a controller sends to this player. */
export interface RemotePlayerHandlers {
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  enqueue(cmd: EnqueueCommand): void;
  queueJump(index: number): void;
  queueRemove(index: number): void;
  /** Every handler below is optional — leaving one out IS how a player
   *  declines a capability. The command is dropped, never errored. */
  setShuffle(enabled: boolean): void;
  setRepeat(mode: RemoteRepeat): void;
  /** Volume 0–1. */
  setVolume(volume: number): void;
  setAudioSettings(settings: RemoteAudioSettings): void;
}

type Handler<K extends keyof RemotePlayerHandlers> = RemotePlayerHandlers[K];

export interface RemotePlayerOptions {
  /** Rocksky access token, or a getter (read fresh on each (re)connect/send). */
  token: string | (() => string | undefined);
  /** Display name shown in the miniplayer device picker. */
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

export class RemotePlayer {
  private ws: WebSocket | null = null;
  private deviceId = "";
  private stopped = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private readonly url: string;
  private readonly heartbeatMs: number;
  private readonly reconnectMs: number;
  private readonly getToken: () => string | undefined;
  private readonly debug: (...args: unknown[]) => void;

  private handlers: Partial<RemotePlayerHandlers> = {};

  // Last state, re-sent after a reconnect so controllers resync instantly.
  private lastTrack: RemoteNowPlaying | null = null;
  private lastStatus: number | null = null;
  private lastQueue: { items: RemoteQueueItem[]; index: number } | null = null;

  constructor(private readonly opts: RemotePlayerOptions) {
    this.url = opts.url ?? DEFAULT_REMOTE_WS;
    this.heartbeatMs = opts.heartbeatMs ?? 10_000;
    this.reconnectMs = opts.reconnectMs ?? 3_000;
    this.getToken =
      typeof opts.token === "function" ? opts.token : () => opts.token as string;
    this.debug = opts.debug ?? (() => {});
  }

  /** Register a handler for a command. Returns `this` for chaining. */
  on<K extends keyof RemotePlayerHandlers>(event: K, handler: Handler<K>): this {
    this.handlers[event] = handler;
    return this;
  }

  /** The server-assigned device id (empty until registered). */
  get id(): string {
    return this.deviceId;
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

  // ── State push ────────────────────────────────────────────────────────────

  /** Advertise the current track. Call whenever it changes, and periodically
   *  (~every 1–4s) with fresh `elapsedMs` so controllers show smooth progress. */
  setNowPlaying(track: RemoteNowPlaying): void {
    this.lastTrack = track;
    this.send({
      type: "message",
      device_id: this.deviceId,
      token: this.getToken(),
      data: {
        type: "track",
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_artist: track.albumArtist ?? track.artist,
        length: track.durationMs ?? 0,
        elapsed: track.elapsedMs ?? 0,
        duration_ms: track.durationMs ?? 0,
        album_art: track.albumArt,
        is_playing: track.isPlaying ?? true,
        codec: track.codec,
        sample_rate: track.sampleRate,
        // Omitted when undefined, so "no such control" stays distinguishable
        // from "off" on the wire.
        ...(track.shuffle !== undefined ? { shuffle: track.shuffle } : {}),
        ...(track.repeat !== undefined ? { repeat: track.repeat } : {}),
        ...(track.volume !== undefined ? { volume: track.volume } : {}),
        device_name: this.opts.name,
      },
    });
  }

  /** Advertise transport state. */
  setStatus(status: "playing" | "paused" | "stopped"): void {
    const code = status === "playing" ? 1 : status === "paused" ? 2 : 0;
    this.lastStatus = code;
    this.send({
      type: "message",
      device_id: this.deviceId,
      token: this.getToken(),
      data: { type: "status", status: code },
    });
  }

  /** Advertise the playback queue + current index. */
  setQueue(items: RemoteQueueItem[], index: number): void {
    this.lastQueue = { items, index };
    this.send({
      type: "message",
      device_id: this.deviceId,
      token: this.getToken(),
      data: {
        type: "queue",
        index,
        queue: items.map((t) => ({
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
      },
    });
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
      // Not authenticated yet — retry so a later login connects.
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
      this.deviceId = "";
      if (!this.stopped) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.open(), this.reconnectMs);
      }
    };
  }

  private handle(msg: Json): void {
    // Our device id comes ONLY from the registration reply. Do NOT read it from
    // `device_registered` (which carries another device's id) — see PROTOCOL.md.
    if (msg.status === "registered" && typeof msg.deviceId === "string") {
      this.deviceId = msg.deviceId;
      this.debug("registered", this.deviceId);
      this.resync();
      return;
    }
    if (msg.type === "command") {
      this.dispatch(msg);
      return;
    }
    // devices / device_registered / device_unregistered / primary_changed and
    // `message` echoes are irrelevant to a pure player — ignore them.
  }

  private dispatch(msg: Json): void {
    const h = this.handlers;
    switch (msg.action) {
      case "play":
        h.play?.();
        break;
      case "pause":
        h.pause?.();
        break;
      case "next":
        h.next?.();
        break;
      case "previous":
        h.previous?.();
        break;
      case "seek": {
        const a = msg.args as { position?: number } | number | undefined;
        const pos = typeof a === "number" ? a : (a?.position ?? 0);
        h.seek?.(pos);
        break;
      }
      case "queue_jump":
        h.queueJump?.((msg.args as { index?: number })?.index ?? 0);
        break;
      case "queue_remove":
        h.queueRemove?.((msg.args as { index?: number })?.index ?? 0);
        break;
      case "enqueue": {
        const a = (msg.args ?? {}) as Json;
        h.enqueue?.({
          tracks: (a.tracks ?? []).map(descriptorToItem),
          mode: a.mode ?? "now",
          shuffle: !!a.shuffle,
          startIndex: a.startIndex ?? 0,
        });
        break;
      }
      case "shuffle": {
        const a = msg.args as { enabled?: boolean } | boolean | undefined;
        h.setShuffle?.(typeof a === "boolean" ? a : !!a?.enabled);
        break;
      }
      case "repeat": {
        const a = msg.args as { mode?: string } | string | undefined;
        const mode = typeof a === "string" ? a : a?.mode;
        h.setRepeat?.(mode === "all" || mode === "one" ? mode : "off");
        break;
      }
      case "volume": {
        const a = msg.args as { volume?: number } | number | undefined;
        const v = typeof a === "number" ? a : (a?.volume ?? 1);
        h.setVolume?.(Math.min(1, Math.max(0, v)));
        break;
      }
      case "audio_settings":
        h.setAudioSettings?.((msg.args ?? {}) as RemoteAudioSettings);
        break;
      default:
        this.debug("unknown command", msg.action);
    }
  }

  // On (re)connect, re-advertise the last known state so controllers resync.
  private resync(): void {
    if (this.lastTrack) this.setNowPlaying(this.lastTrack);
    if (this.lastStatus !== null) {
      this.send({
        type: "message",
        device_id: this.deviceId,
        token: this.getToken(),
        data: { type: "status", status: this.lastStatus },
      });
    }
    if (this.lastQueue) this.setQueue(this.lastQueue.items, this.lastQueue.index);
  }
}

function descriptorToItem(d: Json): RemoteQueueItem {
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
