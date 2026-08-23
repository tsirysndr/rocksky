// Drop-in replacement for the `rockbox-wasm` npm package, backed by the Tauri
// native Rockbox engine (desktop/src-tauri). The vite config aliases
// "rockbox-wasm" to this file so the copied web-app sources import it
// unchanged. The public surface mirrors node_modules/rockbox-wasm/index.d.ts.

import { invoke } from "@tauri-apps/api/core";

// ── Queue metadata bridge ──────────────────────────────────────────────────
//
// The native side only receives URLs and cannot read tags off an HTTP stream,
// so a streamed entry ends up titled "stream?token=…" — which is what remote
// controllers then display for this device. The app installs a resolver here
// (it already keeps a URL → track registry) so real metadata ships alongside
// the URLs. No resolver installed → unchanged behaviour.

export interface QueueMeta {
  uploadId?: string;
  trackId?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string | null;
  durationMs?: number;
  songUri?: string;
  albumUri?: string;
  trackNumber?: number | null;
}

let queueMetaResolver: ((url: string) => QueueMeta | undefined) | null = null;

export function setQueueMetaResolver(
  fn: ((url: string) => QueueMeta | undefined) | null,
): void {
  queueMetaResolver = fn;
}

function metaFor(urls: string[]): Record<string, unknown>[] {
  return urls.map((url) => {
    const t = queueMetaResolver?.(url);
    return {
      uploadId: t?.uploadId ?? "",
      trackId: t?.trackId ?? "",
      title: t?.title ?? "",
      artist: t?.artist ?? "",
      album: t?.album ?? "",
      albumArtist: t?.albumArtist ?? "",
      albumArt: t?.albumArt ?? "",
      durationMs: t?.durationMs ?? 0,
      songUri: t?.songUri ?? "",
      albumUri: t?.albumUri ?? "",
      trackNumber: t?.trackNumber ?? 0,
    };
  });
}

// ── Options ────────────────────────────────────────────────────────────────

export interface RockboxPlayerOptions {
  /**
   * Base URL the wasm package's dist files are served from. Ignored here —
   * the native engine has no web assets to load.
   */
  baseUrl?: string;
  /** Explicit URL of `rockbox-core.js` (ignored by the native backend). */
  coreUrl?: string;
  /** Explicit URL of `rockbox-audio-worklet.js` (ignored). */
  workletUrl?: string;
  /** Explicit URL of `rockbox-decoder-worker.js` (ignored). */
  workerUrl?: string;
}

/** "stopped" | "playing" | "paused". */
export type PlaybackState = "stopped" | "playing" | "paused";

// ── String enums (values match rockbox-wasm exactly) ───────────────────────

/** Repeat mode. Setters also accept the raw int (0 off, 1 one, 2 all). */
export enum RepeatMode {
  Off = "off",
  One = "one",
  All = "all",
}

/** ReplayGain mode. Setters also accept the raw int (0 track, 1 album, 2 shuffle, 3 off). */
export enum ReplayGainMode {
  Off = "off",
  Track = "track",
  Album = "album",
  Shuffle = "shuffle",
}

/** Channel mixing mode. Setters also accept the raw int (0–6). */
export enum ChannelMode {
  Stereo = "stereo",
  Mono = "mono",
  Custom = "custom",
  MonoLeft = "mono-left",
  MonoRight = "mono-right",
  Karaoke = "karaoke",
  Swap = "swap",
}

/** Headphone crossfeed mode. Setters also accept the raw int (0 off, 1 Meier, 2 custom). */
export enum CrossfeedMode {
  Off = "off",
  Meier = "meier",
  Custom = "custom",
}

/** When a track change crossfades (Rockbox's `crossfade` setting).
 *  Setters also accept the raw int (0–5, in this order). */
export enum CrossfadeMode {
  Off = "off",
  AutoSkip = "auto-skip",
  ManualSkip = "manual-skip",
  Shuffle = "shuffle",
  ShuffleOrManualSkip = "shuffle-or-manual",
  Always = "always",
}

/** How the outgoing track behaves during the crossfade overlap. */
export enum CrossfadeMixMode {
  /** Both tracks fade — outgoing ramps to silence as incoming ramps up. */
  Crossfade = "crossfade",
  /** Outgoing stays at full volume; the incoming track is mixed on top. */
  Mix = "mix",
}

/** Rockbox playlist insertion modes. Setters also accept the raw int (0–7). */
export enum InsertMode {
  Prepend = "prepend",
  /** After the previous Insert batch (Rockbox's chained "Insert"). */
  Insert = "insert",
  /** Directly after the current track. */
  PlayNext = "insert-next",
  /** Append to the end of the queue. */
  PlayLast = "insert-last",
  /** A random slot after the current track. */
  InsertShuffled = "insert-shuffled",
  /** Append the batch in random order. */
  InsertLastShuffled = "insert-last-shuffled",
  /** Replace the whole queue. */
  Replace = "replace",
  /** Explicit position (pass `index`). */
  AtIndex = "index",
}

/** Crossfade options (seconds; Rockbox ranges — delays 0–7 s, durations 0–15 s). */
export interface CrossfadeOptions {
  fadeOutDelay?: number;
  fadeOutDuration?: number;
  fadeInDelay?: number;
  fadeInDuration?: number;
  mixMode?: CrossfadeMixMode | number;
}

/** One `.m3u` / `.m3u8` entry. */
export interface M3uEntry {
  url: string;
  title: string | null;
  durationMs: number | null;
}

export interface TrackMetadata {
  codec?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumartist?: string;
  genre?: string;
  year?: number;
  duration_ms?: number;
  bitrate?: number;
  sample_rate?: number;
  /** Live-radio station name, when available. */
  station?: string;
  [key: string]: unknown;
}

export interface StatusEvent {
  state: PlaybackState;
  index: number;
  queue_len: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface TrackEvent {
  index: number;
  url: string;
  /** True for an unbounded live stream (no duration, not seekable). */
  live: boolean;
  metadata: TrackMetadata | null;
}

export interface ProgressEvent {
  state: PlaybackState;
  index: number;
  live: boolean;
  elapsed_ms: number;
  /** 0 for live streams (unknown / infinite). */
  duration_ms: number;
  metadata: TrackMetadata | null;
}

export interface QueueEvent {
  urls: string[];
  index: number;
}

export interface ErrorEvent {
  message: string;
  index?: number;
}

export interface RockboxEventMap {
  status: StatusEvent;
  track: TrackEvent;
  progress: ProgressEvent;
  queue: QueueEvent;
  error: ErrorEvent;
}

// ── Enum → raw-int coercion (rockbox-wasm's documented codes) ──────────────

const REPEAT_INTS: Record<string, number> = { off: 0, one: 1, all: 2 };
const REPLAYGAIN_INTS: Record<string, number> = {
  track: 0,
  album: 1,
  shuffle: 2,
  off: 3,
};
const CHANNEL_MODE_INTS: Record<string, number> = {
  stereo: 0,
  mono: 1,
  custom: 2,
  "mono-left": 3,
  "mono-right": 4,
  karaoke: 5,
  swap: 6,
};
const CROSSFEED_INTS: Record<string, number> = { off: 0, meier: 1, custom: 2 };
const CROSSFADE_INTS: Record<string, number> = {
  off: 0,
  "auto-skip": 1,
  "manual-skip": 2,
  shuffle: 3,
  "shuffle-or-manual": 4,
  always: 5,
};
const CROSSFADE_MIX_INTS: Record<string, number> = { crossfade: 0, mix: 1 };
const INSERT_MODE_INTS: Record<string, number> = {
  prepend: 0,
  insert: 1,
  "insert-next": 2,
  "insert-last": 3,
  "insert-shuffled": 4,
  "insert-last-shuffled": 5,
  replace: 6,
  index: 7,
};

function toInt(value: string | number, table: Record<string, number>): number {
  if (typeof value === "number") return value;
  return table[value] ?? 0;
}

function toRepeatEnum(label: string): RepeatMode {
  if (label === "one") return RepeatMode.One;
  if (label === "all") return RepeatMode.All;
  return RepeatMode.Off;
}

function toRepeatLabel(mode: RepeatMode | number): "off" | "one" | "all" {
  const code = typeof mode === "number" ? mode : REPEAT_INTS[mode] ?? 0;
  if (code === 1) return "one";
  if (code === 2) return "all";
  return "off";
}

// ── Backend DTO (player_status; Tauri serializes camelCase) ────────────────

interface NativeStatus {
  state: PlaybackState;
  index: number | null;
  positionMs: number;
  durationMs: number;
  queueLen: number;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  volume: number;
  title: string;
  artist: string;
  album: string;
  codec?: string | null;
  sampleRate?: number | null;
  bitrate?: number | null;
}

function queuesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((url, i) => url === b[i]);
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

const POLL_INTERVAL_MS = 500;

// Internal listener store. `never` makes any concrete event listener
// assignable via the casts in on/off/emit, which are type-safe at the public
// surface because on/off tie `event` and `cb` to the same K.
type AnyListener = (data: never) => void;

/**
 * A music player with the rockbox-wasm `RockboxPlayer` API, forwarding every
 * operation to the Tauri native Rockbox engine via `invoke`. State/events are
 * synthesized from a 500 ms `player_status` + `player_queue_paths` poll.
 */
export class RockboxPlayer {
  /** Latest status snapshot (also delivered via the `status` event). */
  state: StatusEvent = {
    state: "stopped",
    index: -1,
    queue_len: 0,
    shuffle: false,
    repeat: RepeatMode.Off,
  };
  progress: { elapsed_ms: number; duration_ms: number } = {
    elapsed_ms: 0,
    duration_ms: 0,
  };
  metadata: TrackMetadata | null = null;
  queue: string[] = [];

  private _ready = false;
  private _volume = 1;
  private _initPromise: Promise<void> | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _polling = false;
  /** URL cued by setQueue, tracked until the engine reports a real index. */
  private _cuedUrl: string | null = null;
  private listeners = new Map<keyof RockboxEventMap, Set<AnyListener>>();

  // Track-event bookkeeping (see the `track` synthesis rules).
  private lastTrackIndex = -1;
  private lastTrackUrl: string | null = null;
  private lastTrackTitle: string | null = null;
  private titleReEmitted = false;

  constructor(_opts?: RockboxPlayerOptions) {
    // baseUrl / coreUrl / workletUrl / workerUrl only matter for the wasm
    // build; the native engine needs none of them.
  }

  /** Boot the status/queue polling loop. Idempotent. */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const [status, paths] = await Promise.all([
        invoke<NativeStatus>("player_status"),
        invoke<string[]>("player_queue_paths"),
      ]);
      this._ready = true;
      this.applyStatus(status, paths, true);
      this._timer ??= setInterval(() => {
        void this.poll();
      }, POLL_INTERVAL_MS);
    })();
    return this._initPromise;
  }

  get ready(): boolean {
    return this._ready;
  }

  /** The native engine owns the audio graph; there is no Web Audio context. */
  get audioContext(): AudioContext | null {
    return null;
  }

  /** Output volume 0.0..=1.0 as last polled (or optimistically set). */
  get volume(): number {
    return this._volume;
  }

  // ── Transport ────────────────────────────────────────────────────────────

  setQueue(urls: string[], autoplay = false): void {
    this.call("player_set_queue", { paths: urls, autoplay });
    if (queueMetaResolver) {
      this.call("player_set_queue_meta", { items: metaFor(urls) });
    }
    // The web UI relies on prompt queue feedback — reflect it immediately.
    // The first queued URL is the cued track: report it as current from the
    // start (the engine reports index null until decode begins, and inserts
    // may reorder the queue meanwhile — _cuedUrl tracks it by URL).
    this._cuedUrl = urls[0] ?? null;
    this.queue = [...urls];
    this.state = { ...this.state, queue_len: urls.length, index: urls.length ? 0 : -1 };
    this.emit("queue", { urls: [...urls], index: this.state.index });
  }

  enqueue(url: string): void {
    this.insert(url, InsertMode.PlayLast);
  }

  /** Insert URL(s) with a Rockbox insertion mode; `index` only applies to
   *  InsertMode.AtIndex. */
  insert(
    urls: string | string[],
    mode: InsertMode | number = InsertMode.PlayLast,
    index = 0,
  ): void {
    const paths = typeof urls === "string" ? [urls] : urls;
    this.call("player_insert", {
      paths,
      mode: toInt(mode, INSERT_MODE_INTS),
      index,
    });
  }

  /** Remove the queue entry at `index` (0-based). */
  removeAt(index: number): void {
    this.call("player_remove", { index });
  }

  clearQueue(): void {
    this.call("player_clear_queue");
  }

  play(): void {
    this.call("player_play");
    if (this.state.state !== "playing") {
      // Optimistic — the 500 ms poll confirms the real engine state.
      this.state = { ...this.state, state: "playing" };
      this.emit("status", { ...this.state });
    }
  }

  pause(): void {
    this.call("player_pause");
    if (this.state.state === "playing") {
      this.state = { ...this.state, state: "paused" };
      this.emit("status", { ...this.state });
    }
  }

  toggle(): void {
    this.call("player_toggle");
  }

  stop(): void {
    this.call("player_stop");
  }

  next(): void {
    this.call("player_next");
  }

  prev(): void {
    this.call("player_previous");
  }

  skipTo(index: number): void {
    // Anchor the pre-decode index fallback to the requested track (the engine
    // reports a null index until it starts decoding).
    this._cuedUrl = this.queue[index] ?? null;
    this.state = { ...this.state, index };
    this.call("player_skip_to", { index });
  }

  seek(ms: number): void {
    this.call("player_seek", { positionMs: Math.max(0, Math.round(ms)) });
  }

  setShuffle(on: boolean): void {
    this.call("player_set_shuffle", { enabled: on });
  }

  setRepeat(mode: RepeatMode | number): void {
    this.call("player_set_repeat", { mode: toRepeatLabel(mode) });
  }

  /** Output volume 0.0..=1.0. */
  setVolume(v: number): void {
    const volume = Math.min(1, Math.max(0, v));
    this._volume = volume;
    this.call("player_set_volume", { volume });
  }

  // ── DSP / equalizer ──────────────────────────────────────────────────────

  setEqEnabled(on: boolean): void {
    this.call("player_set_eq_enabled", { enabled: on });
  }

  /** band 0..9, cutoff in Hz, Q factor, gain in dB. */
  setEqBand(band: number, cutoffHz: number, q: number, gainDb: number): void {
    this.call("player_set_eq_band", { band, cutoffHz, q, gainDb });
  }

  setEqPrecut(db: number): void {
    this.call("player_set_eq_precut", { db });
  }

  setTone(bassDb: number, trebleDb: number): void {
    this.call("player_set_tone", { bassDb, trebleDb });
  }

  setToneCutoffs(bassHz: number, trebleHz: number): void {
    this.call("player_set_tone_cutoffs", { bassHz, trebleHz });
  }

  setSurround(delayMs: number, balance: number, fx1: number, fx2: number): void {
    this.call("player_set_surround", { opts: { delayMs, balance, fx1, fx2 } });
  }

  /** Headphone crossfeed. Gains in tenths of dB (≤0). */
  setCrossfeed(
    mode: CrossfeedMode | number,
    directGain = -15,
    crossLfGain = -60,
    crossHfGain = -160,
    hfCutoff = 700,
  ): void {
    this.call("player_set_crossfeed", {
      mode: toInt(mode, CROSSFEED_INTS),
      directGain,
      crossGain: crossLfGain,
      highFreqGain: crossHfGain,
      hfCutoff,
    });
  }

  /** Perceptual Bass Enhancement: strength 0–100, precut in tenths of dB (≤0). */
  setPbe(strength: number, precut = 0): void {
    this.call("player_set_pbe", { strength, precut });
  }

  /** Rockbox crossfade (the pcmbuf algorithm). */
  setCrossfade(mode: CrossfadeMode | number, opts?: CrossfadeOptions): void {
    this.call("player_set_crossfade", {
      mode: toInt(mode, CROSSFADE_INTS),
      opts: {
        fadeOutDelay: opts?.fadeOutDelay ?? 0,
        fadeOutDuration: opts?.fadeOutDuration ?? 0,
        fadeInDelay: opts?.fadeInDelay ?? 0,
        fadeInDuration: opts?.fadeInDuration ?? 0,
        mixMode: toInt(opts?.mixMode ?? 0, CROSSFADE_MIX_INTS),
      },
    });
  }

  setChannelMode(mode: ChannelMode | number): void {
    this.call("player_set_channel_mode", {
      mode: toInt(mode, CHANNEL_MODE_INTS),
    });
  }

  setStereoWidth(percent: number): void {
    this.call("player_set_stereo_width", { percent });
  }

  setCompressor(
    threshold: number,
    makeup: number,
    ratio: number,
    knee: number,
    release: number,
    attack: number,
  ): void {
    this.call("player_set_compressor", {
      opts: { threshold, makeup, ratio, knee, release, attack },
    });
  }

  setReplaygain(
    mode: ReplayGainMode | number,
    noclip: boolean,
    preampDb: number,
  ): void {
    this.call("player_set_replaygain", {
      mode: toInt(mode, REPLAYGAIN_INTS),
      noclip,
      preampDb,
    });
  }

  /** The 10 default EQ band centre frequencies (Hz). */
  static readonly EQ_BAND_CUTOFFS: number[] = [
    32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
  ];

  // ── M3U / M3U8 playlists ─────────────────────────────────────────────────

  /** Whether `url` looks like an .m3u / .m3u8 playlist. */
  static isM3uUrl(url: string): boolean {
    return /\.m3u8?(?:[?#]|$)/i.test(url);
  }

  /** Parse playlist text; relative paths resolve against `baseUrl`. */
  static parseM3u(text: string, baseUrl?: string): M3uEntry[] {
    const entries: M3uEntry[] = [];
    let pendingTitle: string | null = null;
    let pendingDurationMs: number | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      if (line.startsWith("#")) {
        const extinf = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
        if (extinf) {
          const seconds = Number.parseFloat(extinf[1]);
          pendingDurationMs =
            Number.isFinite(seconds) && seconds > 0
              ? Math.round(seconds * 1000)
              : null;
          const title = extinf[2].trim();
          pendingTitle = title.length > 0 ? title : null;
        }
        continue;
      }
      entries.push({
        url: resolveUrl(line, baseUrl),
        title: pendingTitle,
        durationMs: pendingDurationMs,
      });
      pendingTitle = null;
      pendingDurationMs = null;
    }
    return entries;
  }

  /** Serialize entries (strings or M3uEntry-likes) to `.m3u8` text. */
  static serializeM3u(
    entries: (
      | string
      | { url: string; title?: string | null; durationMs?: number | null }
    )[],
  ): string {
    const lines: string[] = ["#EXTM3U"];
    for (const entry of entries) {
      if (typeof entry === "string") {
        lines.push(entry);
        continue;
      }
      if (entry.title != null || entry.durationMs != null) {
        const seconds =
          entry.durationMs != null && entry.durationMs > 0
            ? Math.round(entry.durationMs / 1000)
            : -1;
        lines.push(`#EXTINF:${seconds},${entry.title ?? ""}`);
      }
      lines.push(entry.url);
    }
    return lines.join("\n") + "\n";
  }

  /** Replace the queue with a playlist's entries; returns the URLs. */
  loadM3u(text: string, opts?: { autoplay?: boolean; baseUrl?: string }): string[] {
    const urls = RockboxPlayer.parseM3u(text, opts?.baseUrl).map((e) => e.url);
    this.setQueue(urls, opts?.autoplay ?? false);
    return urls;
  }

  /** Add a playlist's entries to the queue with any InsertMode; returns the URLs. */
  enqueueM3u(
    text: string,
    opts?: { baseUrl?: string; mode?: InsertMode | number },
  ): string[] {
    const urls = RockboxPlayer.parseM3u(text, opts?.baseUrl).map((e) => e.url);
    if (urls.length > 0) this.insert(urls, opts?.mode ?? InsertMode.PlayLast);
    return urls;
  }

  /** Fetch an .m3u/.m3u8 URL and replace the queue with it. */
  async loadM3uUrl(url: string, autoplay = false): Promise<string[]> {
    const text = await fetchPlaylist(url);
    return this.loadM3u(text, { autoplay, baseUrl: url });
  }

  /** Fetch an .m3u/.m3u8 URL and add it to the queue. */
  async enqueueM3uUrl(
    url: string,
    mode: InsertMode | number = InsertMode.PlayLast,
  ): Promise<string[]> {
    const text = await fetchPlaylist(url);
    return this.enqueueM3u(text, { baseUrl: url, mode });
  }

  /** The current queue as `.m3u8` text. */
  exportM3u(): string {
    return RockboxPlayer.serializeM3u(this.queue);
  }

  // ── Events ───────────────────────────────────────────────────────────────

  on<K extends keyof RockboxEventMap>(
    event: K,
    cb: (data: RockboxEventMap[K]) => void,
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as AnyListener);
    return this;
  }

  off<K extends keyof RockboxEventMap>(
    event: K,
    cb: (data: RockboxEventMap[K]) => void,
  ): this {
    this.listeners.get(event)?.delete(cb as AnyListener);
    return this;
  }

  /** Persisted settings — the native engine keeps its own; nothing here. */
  getSettings(): Record<string, unknown> {
    return {};
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private emit<K extends keyof RockboxEventMap>(
    event: K,
    data: RockboxEventMap[K],
  ): void {
    const set = this.listeners.get(event) as
      | Set<(data: RockboxEventMap[K]) => void>
      | undefined;
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(data);
      } catch (err) {
        console.warn("[tauri-rockbox] listener error", err);
      }
    }
  }

  /** Fire-and-forget invoke — the poll loop reconciles actual state. */
  private call(cmd: string, args?: Record<string, unknown>): void {
    invoke(cmd, args).catch((err: unknown) => {
      console.warn(`[tauri-rockbox] ${cmd} failed`, err);
    });
  }

  private async poll(): Promise<void> {
    if (this._polling) return;
    this._polling = true;
    try {
      const [status, paths] = await Promise.all([
        invoke<NativeStatus>("player_status"),
        invoke<string[]>("player_queue_paths"),
      ]);
      this.applyStatus(status, paths, false);
    } catch (err) {
      console.warn("[tauri-rockbox] status poll failed", err);
    } finally {
      this._polling = false;
    }
  }

  private buildMetadata(s: NativeStatus): TrackMetadata | null {
    const hasTags = s.title !== "" || s.artist !== "" || s.album !== "";
    if (!hasTags && !(s.durationMs > 0)) return null;
    const metadata: TrackMetadata = { duration_ms: s.durationMs };
    if (s.title !== "") metadata.title = s.title;
    if (s.artist !== "") metadata.artist = s.artist;
    if (s.album !== "") metadata.album = s.album;
    if (s.codec != null && s.codec !== "") metadata.codec = s.codec;
    if (s.sampleRate != null) metadata.sample_rate = s.sampleRate;
    if (s.bitrate != null) metadata.bitrate = s.bitrate;
    return metadata;
  }

  private applyStatus(s: NativeStatus, paths: string[], initial: boolean): void {
    // While the engine is still probing/decoding (index null) keep pointing
    // at the cued track — by URL, so background-fill inserts that reorder the
    // queue don't shift what the UI (and the resume snapshot) call current.
    let liveIndex = s.index ?? -1;
    if (s.index == null && this._cuedUrl) {
      liveIndex = paths.indexOf(this._cuedUrl);
    } else if (s.index != null) {
      this._cuedUrl = null;
    }
    const nextState: StatusEvent = {
      state: s.state,
      index: liveIndex,
      queue_len: s.queueLen,
      shuffle: s.shuffle,
      repeat: toRepeatEnum(s.repeat),
    };
    const prev = this.state;
    const statusChanged =
      initial ||
      prev.state !== nextState.state ||
      prev.index !== nextState.index ||
      prev.queue_len !== nextState.queue_len ||
      prev.shuffle !== nextState.shuffle ||
      prev.repeat !== nextState.repeat;
    const queueChanged =
      !queuesEqual(this.queue, paths) || prev.index !== nextState.index;

    // Refresh public fields before emitting so listeners always observe the
    // freshest snapshot (metadata included) from any event.
    this.state = nextState;
    this.progress = { elapsed_ms: s.positionMs, duration_ms: s.durationMs };
    this.metadata = this.buildMetadata(s);
    this.queue = paths;
    this._volume = s.volume;

    if (statusChanged) this.emit("status", { ...nextState });
    if (queueChanged) {
      this.emit("queue", { urls: [...paths], index: nextState.index });
    }

    const url = nextState.index >= 0 ? paths[nextState.index] : undefined;
    if (url !== undefined) {
      if (nextState.index !== this.lastTrackIndex || url !== this.lastTrackUrl) {
        // New (index, url) pair — the engine may still report the previous
        // track's tags; a follow-up `track` fires below once the title flips.
        this.lastTrackIndex = nextState.index;
        this.lastTrackUrl = url;
        this.lastTrackTitle = this.metadata?.title ?? null;
        this.titleReEmitted = false;
        this.emit("track", {
          index: nextState.index,
          url,
          live: false,
          metadata: this.metadata,
        });
      } else {
        const title = this.metadata?.title ?? null;
        if (
          !this.titleReEmitted &&
          this.lastTrackTitle != null &&
          title != null &&
          title !== this.lastTrackTitle
        ) {
          // The engine filled real tags after the track started — re-emit
          // once per (index, url) so listeners pick up the new metadata.
          this.titleReEmitted = true;
          this.lastTrackTitle = title;
          this.emit("track", {
            index: nextState.index,
            url,
            live: false,
            metadata: this.metadata,
          });
        }
      }
    }

    if (nextState.state !== "stopped") {
      this.emit("progress", {
        state: nextState.state,
        index: nextState.index,
        live: false,
        elapsed_ms: s.positionMs,
        duration_ms: s.durationMs,
        metadata: this.metadata,
      });
    }
  }
}

async function fetchPlaylist(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch playlist ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

export default RockboxPlayer;
