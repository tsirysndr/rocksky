import type { PlayerStatus } from "rockbox-ffi/node";

export interface QueueItem {
  uploadId: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  duration?: number;
  mimeType?: string;
  uri?: string; // song at:// URI, used for like/dislike
  trackId?: string; // tracks.xata_id — the Subsonic song id (playlists)
}

// Native enum values (see rockbox-ffi enums) kept inline so we don't eagerly
// import the module (which would load the native lib before playback).
export const Repeat = { Off: 0, One: 1, All: 2 } as const;

// All queue insert positions the rockbox player supports.
export const InsertPosition = {
  PREPEND: 0,
  INSERT: 1,
  INSERT_NEXT: 2,
  INSERT_LAST: 3,
  INSERT_SHUFFLED: 4,
  INSERT_LAST_SHUFFLED: 5,
  REPLACE: 6,
  INDEX: 7,
} as const;

export type InsertPositionValue =
  (typeof InsertPosition)[keyof typeof InsertPosition];

// Centre frequencies for the graphic-EQ band sliders.
export const EQ_BANDS_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
export const EQ_MAX_DB = 12;
export const TONE_MAX_DB = 24;

// Crossfade modes, indexed by their native CrossfadeMode value.
export const CROSSFADE_MODES = [
  "Off",
  "Auto skip",
  "Manual skip",
  "Shuffle",
  "Shuffle/manual",
  "Always",
];

export interface SoundState {
  eqEnabled: boolean;
  bands: number[];
  bass: number;
  treble: number;
  crossfade: number;
  crossfadeSeconds: number;
  mixMode: number; // MixMode: 0 = Crossfade, 1 = Mix
  replaygain: number; // ReplayGainMode: 0 = Off, 1 = Track, 2 = Album
  replaygainPreamp: number; // dB
  replaygainClip: boolean; // prevent clipping
}

export const MIX_MODES = ["Crossfade", "Mix"];
export const REPLAYGAIN_MODES = ["Off", "Track", "Album"];

// Extract the stable uploadId from a queue entry, whether it is a stream URL
// (`…/uploads/<id>/stream?token=…`) or a cached local file (`…/<id>.<ext>`).
export function uploadIdOf(entry: string): string | null {
  const m = entry.match(/\/uploads\/([^/]+)\/stream/);
  if (m) return m[1];
  const base = entry.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) || null;
}

// Ordered list for the insert-mode menu.
export const INSERT_MODES: { pos: InsertPositionValue; label: string }[] = [
  { pos: InsertPosition.INSERT_NEXT, label: "Play next" },
  { pos: InsertPosition.INSERT_LAST, label: "Play last" },
  { pos: InsertPosition.PREPEND, label: "Prepend (front of queue)" },
  { pos: InsertPosition.INSERT, label: "Insert (after current)" },
  { pos: InsertPosition.INSERT_SHUFFLED, label: "Insert shuffled" },
  { pos: InsertPosition.INSERT_LAST_SHUFFLED, label: "Insert last, shuffled" },
  { pos: InsertPosition.INDEX, label: "Insert at current position" },
  { pos: InsertPosition.REPLACE, label: "Replace queue" },
];

/**
 * Thin singleton around the rockbox-ffi `Player`. The native library is loaded
 * lazily on first playback so the TUI can open even where no audio device (or
 * prebuilt binary) is available — the error only surfaces when you press play.
 */
class PlayerController {
  private player: any = null;
  queueItems: QueueItem[] = [];

  // Desired transport preferences, mirrored to settings.toml. Applied to the
  // native player as soon as it is created (see `ensure`).
  private _volume = 0.9;
  private _shuffle = false;
  private _repeat = 0;

  // Called whenever a persisted setting changes; wired to settings.toml saving.
  onSettingsChange: (() => void) | null = null;
  private notify() {
    this.onSettingsChange?.();
  }

  private async ensure() {
    if (!this.player) {
      const { Player } = await import("rockbox-ffi/node");
      const ms = Math.round(this.sound.crossfadeSeconds * 1000);
      // A large read-ahead buffer is required for crossfade to work (it must
      // hold the tail of the current track and the head of the next at once)
      // and also smooths out streaming gaps between tracks.
      this.player = new Player({
        volume: this._volume,
        bufferSeconds: 64,
        crossfadeMode: this.sound.crossfade,
        fadeOutDurationMs: ms,
        fadeInDurationMs: ms,
        mixMode: this.sound.mixMode,
      });
      // Apply persisted preferences to the fresh engine.
      this.player.setShuffle(this._shuffle);
      this.player.setRepeat(this._repeat);
      this.player.setEqEnabled(this.sound.eqEnabled);
      this.sound.bands.forEach((g, i) =>
        this.player.setEqBand(i, EQ_BANDS_HZ[i], 1.0, g),
      );
      this.player.setBass(this.sound.bass);
      this.player.setTreble(this.sound.treble);
      this.applyCrossfade();
      this.applyReplaygain();
    }
    return this.player;
  }

  applySettings(s: {
    volume: number;
    shuffle: boolean;
    repeat: "off" | "one" | "all";
    equalizer: {
      enabled: boolean;
      bands: number[];
      bass: number;
      treble: number;
      crossfade: number;
      crossfadeSeconds: number;
      mixMode: number;
      replaygain: number;
      replaygainPreamp: number;
      replaygainClip: boolean;
    };
  }) {
    this._volume = s.volume;
    this._shuffle = s.shuffle;
    this._repeat = { off: 0, one: 1, all: 2 }[s.repeat] ?? 0;
    this.sound = {
      eqEnabled: s.equalizer.enabled,
      bands: EQ_BANDS_HZ.map((_, i) => s.equalizer.bands[i] ?? 0),
      bass: s.equalizer.bass,
      treble: s.equalizer.treble,
      crossfade: s.equalizer.crossfade,
      crossfadeSeconds: s.equalizer.crossfadeSeconds,
      mixMode: s.equalizer.mixMode,
      replaygain: s.equalizer.replaygain,
      replaygainPreamp: s.equalizer.replaygainPreamp,
      replaygainClip: s.equalizer.replaygainClip,
    };
  }

  snapshotSettings() {
    return {
      volume: this._volume,
      shuffle: this._shuffle,
      repeat: (["off", "one", "all"] as const)[this._repeat] ?? "off",
      equalizer: {
        enabled: this.sound.eqEnabled,
        bands: [...this.sound.bands],
        bass: this.sound.bass,
        treble: this.sound.treble,
        crossfade: this.sound.crossfade,
        crossfadeSeconds: this.sound.crossfadeSeconds,
        mixMode: this.sound.mixMode,
        replaygain: this.sound.replaygain,
        replaygainPreamp: this.sound.replaygainPreamp,
        replaygainClip: this.sound.replaygainClip,
      },
    };
  }

  // Fired whenever the queue changes so the UI can refresh instantly.
  onQueueChange: (() => void) | null = null;

  private notifyQueue() {
    this.onQueueChange?.();
  }

  // `queueItems` is the source of truth for what's queued: every mutation
  // mirrors exactly the operation sent to the engine (splice/push/unshift), so
  // the displayed track info always matches the real queue — no fragile parsing
  // of the engine's entry strings.
  async playQueue(items: QueueItem[], urls: string[], startIndex = 0) {
    const player = await this.ensure();
    player.setQueue(urls);
    player.play();
    if (startIndex > 0) player.skipTo(startIndex);
    this.queueItems = items.slice();
    this.notifyQueue();
  }

  async insertAt(items: QueueItem[], urls: string[], position: number) {
    const player = await this.ensure();
    const status = player.status();
    if (
      !status ||
      status.queue_len === 0 ||
      position === InsertPosition.REPLACE
    ) {
      return this.playQueue(items, urls, 0);
    }
    const cur = status.index ?? 0;
    if (
      position === InsertPosition.INSERT_NEXT ||
      position === InsertPosition.INSERT
    ) {
      player.insert(urls, InsertPosition.INDEX, cur + 1);
      this.queueItems.splice(cur + 1, 0, ...items);
    } else if (position === InsertPosition.INDEX) {
      player.insert(urls, InsertPosition.INDEX, cur);
      this.queueItems.splice(cur, 0, ...items);
    } else if (position === InsertPosition.PREPEND) {
      player.insert(urls, InsertPosition.INDEX, 0);
      this.queueItems.unshift(...items);
    } else if (position === InsertPosition.INSERT_LAST) {
      player.insert(urls, InsertPosition.INSERT_LAST, 0);
      this.queueItems.push(...items);
    } else {
      // Shuffled variants: the engine decides placement; append to our view.
      player.insert(urls, position, 0);
      this.queueItems.push(...items);
    }
    this.notifyQueue();
  }

  playNext(items: QueueItem[], urls: string[]) {
    return this.insertAt(items, urls, InsertPosition.INSERT_NEXT);
  }

  playLast(items: QueueItem[], urls: string[]) {
    return this.insertAt(items, urls, InsertPosition.INSERT_LAST);
  }

  // Swap the queue entry at `index` to a local (cached) file path, for gapless
  // prefetch. The track is unchanged, so `queueItems` needs no update.
  swapQueueToLocal(index: number, filePath: string) {
    if (!this.player) return;
    const status = this.player.status();
    if (!status || index === status.index || index >= status.queue_len) return;
    const q: string[] = this.player.queue();
    if (q[index] === filePath) return;
    this.player.remove(index);
    this.player.insert([filePath], InsertPosition.INDEX, index);
    this.notifyQueue();
  }

  toggle() {
    this.player?.toggle();
  }

  play() {
    this.player?.play();
  }

  pause() {
    this.player?.pause();
  }

  next() {
    this.player?.next();
  }

  previous() {
    this.player?.previous();
  }

  skipTo(index: number) {
    this.player?.skipTo(index);
  }

  seekMs(ms: number) {
    this.player?.seekMs(ms);
  }

  // Remove the track at `index` from the queue.
  removeAt(index: number) {
    if (!this.player) return;
    this.player.remove(index);
    this.queueItems.splice(index, 1);
    this.notifyQueue();
  }

  // A restored-but-not-yet-playing session (queue + position) loaded on startup.
  restored: { items: QueueItem[]; index: number; positionMs: number } | null =
    null;

  restoreSession(session: {
    items: QueueItem[];
    index: number;
    positionMs: number;
  }) {
    this.restored = session;
    this.queueItems = session.items;
  }

  // Current queue + playback position, or null when nothing is queued.
  sessionSnapshot(): {
    queue: QueueItem[];
    index: number;
    positionMs: number;
  } | null {
    if (this.queueItems.length === 0) return null;
    const status = this.status();
    return {
      queue: this.queueItems,
      index: status?.index ?? 0,
      positionMs: status?.position_ms ?? 0,
    };
  }

  toggleShuffle() {
    this._shuffle = !this._shuffle;
    this.player?.setShuffle(this._shuffle);
    this.notify();
  }

  isShuffle(): boolean {
    return this._shuffle;
  }

  setRepeat(mode: number) {
    this._repeat = mode;
    this.player?.setRepeat(mode);
    this.notify();
  }

  repeat(): number {
    return this._repeat;
  }

  // --- sound settings -------------------------------------------------------
  sound: SoundState = {
    eqEnabled: false,
    bands: EQ_BANDS_HZ.map(() => 0),
    bass: 0,
    treble: 0,
    crossfade: 5, // CrossfadeMode.ALWAYS — on by default
    crossfadeSeconds: 5,
    mixMode: 0,
    replaygain: 0,
    replaygainPreamp: 0,
    replaygainClip: true,
  };

  private applyReplaygain() {
    this.player?.setReplaygain(
      this.sound.replaygain,
      this.sound.replaygainPreamp,
      this.sound.replaygainClip,
    );
  }

  async setReplaygain(mode: number) {
    this.sound.replaygain = mode;
    this.notify();
    await this.ensure();
    this.applyReplaygain();
  }

  async setReplaygainPreamp(db: number) {
    this.sound.replaygainPreamp = Math.max(-12, Math.min(12, db));
    this.notify();
    await this.ensure();
    this.applyReplaygain();
  }

  async toggleReplaygainClip() {
    this.sound.replaygainClip = !this.sound.replaygainClip;
    this.notify();
    await this.ensure();
    this.applyReplaygain();
  }

  private applyCrossfade() {
    if (!this.player) return;
    const ms = Math.round(this.sound.crossfadeSeconds * 1000);
    this.player.setCrossfade(
      this.sound.crossfade,
      0,
      ms,
      0,
      ms,
      this.sound.mixMode,
    );
  }

  // Sound setters update `this.sound` synchronously (so the UI re-reads the new
  // value immediately) and apply to the native engine after it is ready.
  async setEqEnabled(enabled: boolean) {
    this.sound.eqEnabled = enabled;
    this.notify();
    const player = await this.ensure();
    player.setEqEnabled(enabled);
  }

  async setEqBandGain(index: number, gainDb: number) {
    this.sound.bands[index] = gainDb;
    const wasEnabled = this.sound.eqEnabled;
    this.sound.eqEnabled = true;
    this.notify();
    const player = await this.ensure();
    player.setEqBand(index, EQ_BANDS_HZ[index], 1.0, gainDb);
    if (!wasEnabled) player.setEqEnabled(true);
  }

  async setBass(gainDb: number) {
    this.sound.bass = gainDb;
    this.notify();
    const player = await this.ensure();
    player.setBass(gainDb);
  }

  async setTreble(gainDb: number) {
    this.sound.treble = gainDb;
    this.notify();
    const player = await this.ensure();
    player.setTreble(gainDb);
  }

  async setCrossfade(mode: number) {
    this.sound.crossfade = mode;
    this.notify();
    await this.ensure();
    this.applyCrossfade();
  }

  async setCrossfadeSeconds(seconds: number) {
    this.sound.crossfadeSeconds = Math.max(0, Math.min(12, seconds));
    this.notify();
    await this.ensure();
    this.applyCrossfade();
  }

  async setMixMode(mode: number) {
    this.sound.mixMode = mode;
    this.notify();
    await this.ensure();
    this.applyCrossfade();
  }

  nudgeVolume(delta: number) {
    this.setVolume(this._volume + delta);
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.player?.setVolume(this._volume);
    this.notify();
  }

  volume(): number {
    return this._volume;
  }

  status(): PlayerStatus | null {
    try {
      return this.player ? this.player.status() : null;
    } catch {
      return null;
    }
  }

  currentItem(): QueueItem | null {
    const status = this.status();
    if (!status || status.index == null) return null;
    return this.queueItems[status.index] ?? null;
  }

  close() {
    try {
      this.player?.stop();
      this.player?.close();
    } catch {
      // ignore teardown errors
    }
    this.player = null;
    this.queueItems = [];
  }
}

export const playerController = new PlayerController();
