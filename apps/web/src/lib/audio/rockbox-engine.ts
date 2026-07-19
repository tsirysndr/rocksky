import { RockboxPlayer } from "rockbox-wasm";
import { getStreamUrl } from "../../api/uploads";
import { EQ_BANDS_HZ } from "../../atoms/equalizer";
import type { QueueTrack } from "../../atoms/queue";

// ─────────────────────────────────────────────────────────────────────────────
// In-browser Rockbox engine (decoders + DSP in WebAssembly).
//
// This is the ONE audible path for uploaded tracks. It replaces the former
// remote rockbox server (GraphQL playlist + HLS output stream): playback,
// decoding, the whole DSP chain, the queue and crossfade all run locally in
// the browser now. Nothing here talks to a rockbox server or an HLS stream.
//
// The runtime assets (core/worker/worklet) are served from /rockbox/* — see the
// cpSync step in vite.config.ts.
// ─────────────────────────────────────────────────────────────────────────────

let player: RockboxPlayer | null = null;

/** The most recent DSP snapshot published via `publishAudioSettings`. Held so a
 *  late-booting engine (init happens on a user gesture, which can land after the
 *  settings have already loaded) can adopt the user's settings on `init()`. */
let latestSettings: GlobalSettings | null = null;
/** JSON of the last snapshot actually applied — used to skip redundant re-applies. */
let latestSettingsJson = "";

// Transport modes are likewise remembered so they survive a late init — the
// repeat/shuffle effects can run before the engine has booted (e.g. repeat set
// to "all" before the first play), and without this the engine would keep its
// firmware defaults and stop at the end of the queue instead of looping.
let latestRepeat = 0; // 0 off, 1 one, 2 all
let latestShuffle = false;

/** Set repeat mode (0 off, 1 one, 2 all). Remembered + applied live if ready. */
export function publishRepeat(mode: number): void {
  latestRepeat = mode;
  if (player?.ready) player.setRepeat(mode);
}

/** Set shuffle. Remembered + applied live if ready. */
export function publishShuffle(on: boolean): void {
  latestShuffle = on;
  if (player?.ready) player.setShuffle(on);
}

// When the user jumps to a queue position, the engine takes a moment (fetch +
// decode) before it reports the new index via a status event — and a late
// status from the outgoing track can carry the OLD index. Pin the user's chosen
// index briefly so those stale events don't revert the "up next" they just
// selected.
let pinnedIndex: { idx: number; until: number } | null = null;

/** Pin the queue index the user just jumped to (for ~2.5 s). */
export function pinQueueIndex(idx: number): void {
  pinnedIndex = { idx, until: Date.now() + 2500 };
}

/** Reconcile an engine-reported index against an active pin: while pinned, keep
 *  the user's chosen index until the engine confirms it (or the pin expires). */
export function effectiveQueueIndex(engineIdx: number): number {
  if (pinnedIndex) {
    if (Date.now() > pinnedIndex.until) pinnedIndex = null;
    else if (engineIdx !== pinnedIndex.idx) return pinnedIndex.idx;
    else pinnedIndex = null; // engine caught up
  }
  return engineIdx;
}

/** Lazy singleton. Cheap to construct (event wiring only); `init()` boots the
 *  AudioContext so it must be reached from a user gesture (see ensureReady). */
export function getRockboxPlayer(): RockboxPlayer {
  if (!player) player = new RockboxPlayer({ baseUrl: "/rockbox" });
  return player;
}

/** Boot the engine if needed (idempotent). Call from a user gesture. */
export async function ensureRockboxReady(): Promise<RockboxPlayer> {
  const p = getRockboxPlayer();
  if (!p.ready) {
    await p.init();
    // Apply whatever DSP settings were last published (the engine may have
    // booted after the settings loaded), so a fresh AudioContext starts with
    // the user's EQ/crossfade/etc. rather than firmware defaults.
    if (latestSettings) {
      applyAudioSettings(p, latestSettings);
      latestSettingsJson = JSON.stringify(latestSettings);
    }
    p.setRepeat(latestRepeat);
    p.setShuffle(latestShuffle);
  }
  return p;
}

// ── Track metadata registry ──────────────────────────────────────────────────
//
// The wasm queue is a list of URLs — it has no idea about title, artist, album
// art, etc. We keep a side registry mapping the EXACT stream URL we enqueue back
// to the rich QueueTrack it came from. The engine stores and echoes queue URLs
// verbatim (queue/track events), so an exact-string key round-trips reliably —
// regardless of the URL shape (`.../uploads/<id>/stream?token=…`,
// `.../stream?u=…`, etc.). (A prior version keyed on an uploadId parsed from the
// path, which silently missed for `?u=`-style URLs and showed raw URLs instead
// of titles.)

const registry = new Map<string, QueueTrack>();

/** Parse an uploadId out of a stream URL, when the path carries one. Only used
 *  as a last-resort label for URLs we didn't enqueue ourselves. */
export function uploadIdFromUrl(url: string): string | null {
  const m = url.match(/\/uploads\/([^/]+)\/stream/);
  return m ? m[1] : null;
}

/** The stream URL the engine should decode for a track. */
export function streamUrlFor(track: QueueTrack): string {
  return track.streamUrl ?? getStreamUrl(track.uploadId);
}

/** Remember tracks keyed by the exact URL they'll be enqueued as, so queue/
 *  track events can be mapped back to full metadata. */
export function registerTracks(tracks: QueueTrack[]): void {
  tracks.forEach((t) => registry.set(streamUrlFor(t), t));
}

/** Rich QueueTrack for a queue/track URL, if we enqueued it ourselves. */
export function trackForUrl(url: string): QueueTrack | undefined {
  return registry.get(url);
}

// ── DSP settings → engine ────────────────────────────────────────────────────

// Kept identical to the old rockbox-graphql `GlobalSettings` shape so the audio
// settings UI (which reads these fields) is unchanged — only the source and the
// sink moved (local atoms + the wasm engine instead of a rockbox server).
export interface EqBand {
  cutoff: number; // Hz
  gain: number; // tenths of dB
  q: number; // ×10
}

export interface ReplayGainSettings {
  noclip: boolean;
  type: number; // 0 off, 1 track, 2 album, 3 trackIfShuffling
  preamp: number; // tenths of dB
}

export interface GlobalSettings {
  volume: number;
  playlistShuffle: boolean;
  repeatMode: number; // 0 off, 1 all, 2 one, 3 shuffle, 4 a-b
  bass: number;
  bassCutoff: number;
  treble: number;
  trebleCutoff: number;
  crossfade: number; // 0 off, 1 on, 2 shuffle, 3 album change, 4 track change
  fadeOnStop: boolean;
  crossfadeFadeInDelay: number; // seconds
  crossfadeFadeInDuration: number; // seconds
  crossfadeFadeOutDelay: number; // seconds
  crossfadeFadeOutDuration: number; // seconds
  crossfadeFadeOutMixmode: number; // 0 crossfade, 1 mix
  balance: number;
  stereoWidth: number;
  stereoswMode: number;
  channelConfig: number; // 0 stereo, 1 mono, 2 custom, 3 mono-left, 4 mono-right, 5 karaoke
  ditheringEnabled: boolean;
  partyMode: boolean;
  playerName: string;
  eqEnabled: boolean;
  eqBandSettings: EqBand[];
  replaygainSettings: ReplayGainSettings;
}

export type SettingsPatch = Partial<{
  volume: number;
  playlistShuffle: boolean;
  repeatMode: number;
  bass: number;
  bassCutoff: number;
  treble: number;
  trebleCutoff: number;
  crossfade: number;
  fadeOnStop: boolean;
  fadeInDelay: number;
  fadeInDuration: number;
  fadeOutDelay: number;
  fadeOutDuration: number;
  fadeOutMixmode: number;
  balance: number;
  stereoWidth: number;
  stereoswMode: number;
  channelConfig: number;
  ditheringEnabled: boolean;
  partyMode: boolean;
  playerName: string;
  eqEnabled: boolean;
  eqBandSettings: EqBand[];
  eqPrecut: number;
  replaygainSettings: ReplayGainSettings;
}>;

// rocksky's crossfade mode ints don't line up 1:1 with rockbox-wasm's
// CrossfadeMode enum, so map explicitly. rocksky: 0 off, 1 always, 2 shuffle,
// 3 album-change, 4 track-change → wasm: 0 Off, 1 AutoSkip, 3 Shuffle, 5 Always.
const CROSSFADE_TO_WASM = [0, 5, 3, 1, 1];

/** Firmware-ish defaults used before any saved settings load. Mirrors the old
 *  rockbox server's initial GlobalSettings closely enough for the UI + engine. */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  volume: 100,
  playlistShuffle: false,
  repeatMode: 0,
  bass: 0,
  bassCutoff: 200,
  treble: 0,
  trebleCutoff: 3500,
  crossfade: 0,
  fadeOnStop: true,
  crossfadeFadeInDelay: 0,
  crossfadeFadeInDuration: 2,
  crossfadeFadeOutDelay: 0,
  crossfadeFadeOutDuration: 2,
  crossfadeFadeOutMixmode: 0,
  balance: 0,
  stereoWidth: 100,
  stereoswMode: 0,
  channelConfig: 0,
  ditheringEnabled: false,
  partyMode: false,
  playerName: "",
  eqEnabled: false,
  eqBandSettings: EQ_BANDS_HZ.map((cutoff) => ({
    cutoff,
    gain: 0,
    q: 10,
  })),
  replaygainSettings: { noclip: false, type: 0, preamp: 0 },
};

/** Push the whole DSP snapshot to the engine. Cheap + idempotent — call it on
 *  init and whenever any audio setting changes. Units mirror rockbox: EQ gain
 *  in tenths of dB, Q ×10; tone in whole dB; crossfade delays/durations in
 *  seconds; replaygain preamp in tenths of dB. */
export function applyAudioSettings(
  p: RockboxPlayer,
  s: GlobalSettings,
): void {
  p.setEqEnabled(s.eqEnabled);
  // Band centre frequencies are fixed physical constants (the 10 rockbox bands),
  // keyed by index — never trust a cutoff that may have been persisted from an
  // older band table. Only the gain is user data.
  s.eqBandSettings.forEach((b, i) =>
    p.setEqBand(i, EQ_BANDS_HZ[i] ?? b.cutoff, b.q / 10, b.gain / 10),
  );
  p.setTone(s.bass, s.treble);
  p.setToneCutoffs(s.bassCutoff, s.trebleCutoff);
  p.setCrossfade(CROSSFADE_TO_WASM[s.crossfade] ?? 0, {
    fadeInDelay: s.crossfadeFadeInDelay,
    fadeInDuration: s.crossfadeFadeInDuration,
    fadeOutDelay: s.crossfadeFadeOutDelay,
    fadeOutDuration: s.crossfadeFadeOutDuration,
    mixMode: s.crossfadeFadeOutMixmode,
  });
  p.setChannelMode(s.channelConfig);
  p.setStereoWidth(s.stereoWidth);
  const rg = s.replaygainSettings;
  p.setReplaygain(rg.type, rg.noclip, rg.preamp / 10);
}

/** Publish the current DSP snapshot: remember it (so a late `init()` adopts it)
 *  and, if the engine is already running, push it live. Safe to call before the
 *  engine has booted — it'll be applied on the next `ensureRockboxReady()`.
 *
 *  Idempotent: if the snapshot is byte-for-byte identical to the last one we
 *  applied, we skip re-applying it. Re-pushing the same EQ recomputes the DSP's
 *  IIR coefficients and briefly disturbs the audio, which is what caused the
 *  "EQ flickers when I open Audio Settings" glitch. */
export function publishAudioSettings(s: GlobalSettings): void {
  latestSettings = s;
  const json = JSON.stringify(s);
  if (json === latestSettingsJson) return;
  latestSettingsJson = json;
  if (player?.ready) applyAudioSettings(player, s);
}
