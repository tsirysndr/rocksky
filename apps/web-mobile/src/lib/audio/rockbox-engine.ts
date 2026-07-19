import { CrossfadeMode, RockboxPlayer } from "rockbox-wasm";
import { getStreamUrl } from "../../api/uploads";
import { EQ_BANDS_HZ, EQ_Q, type EqBandSetting } from "../../atoms/equalizer";
import type { QueueTrack } from "../../atoms/queue";

// ─────────────────────────────────────────────────────────────────────────────
// In-browser Rockbox engine (decoders + DSP in WebAssembly).
//
// This is the ONE audible path for uploaded ("My Library") tracks. It replaces
// the old <audio> element + custom DSP AudioWorklet + WAV-transcode fallback:
// decoding (FLAC/ALAC/etc.), the 10-band EQ, crossfade and the queue all run
// locally in the browser now. Nothing here streams via HLS or talks to a
// remote rockbox server.
//
// Runtime assets (core/worker/worklet) are served from /rockbox/* — see the
// cpSync step in vite.config.ts.
// ─────────────────────────────────────────────────────────────────────────────

let player: RockboxPlayer | null = null;

/** The most recent EQ + crossfade snapshot published from the atoms. Held so a
 *  late-booting engine (init runs on a user gesture) adopts them on init(). */
let latestEq: { enabled: boolean; bands: EqBandSetting[] } | null = null;
let latestCrossfade: { enabled: boolean; durationSec: number } | null = null;

/** Lazy singleton. Cheap to construct; `init()` boots the AudioContext so it
 *  must be reached from a user gesture (see ensureRockboxReady). */
export function getRockboxPlayer(): RockboxPlayer {
  if (!player) player = new RockboxPlayer({ baseUrl: "/rockbox" });
  return player;
}

/** Boot the engine if needed (idempotent). Call from a user gesture. */
export async function ensureRockboxReady(): Promise<RockboxPlayer> {
  const p = getRockboxPlayer();
  if (!p.ready) {
    await p.init();
    // Adopt whatever settings were last published (the engine may have booted
    // after they loaded), so a fresh AudioContext starts with the user's EQ.
    if (latestEq) applyEq(p, latestEq.enabled, latestEq.bands);
    if (latestCrossfade)
      applyCrossfade(p, latestCrossfade.enabled, latestCrossfade.durationSec);
  }
  return p;
}

// ── Track metadata registry ──────────────────────────────────────────────────
//
// The wasm queue is a list of URLs — it has no metadata. Map the EXACT stream
// URL we enqueue back to the rich QueueTrack it came from. The engine stores +
// echoes queue URLs verbatim (queue/track events), so an exact-string key
// round-trips reliably for any URL shape (`.../uploads/<id>/stream?token=…`,
// `.../stream?u=…`, etc.). Keying on a path-parsed uploadId silently missed
// `?u=`-style URLs and showed raw URLs instead of titles.

const registry = new Map<string, QueueTrack>();

/** Last-resort label for URLs we didn't enqueue ourselves. */
export function uploadIdFromUrl(url: string): string | null {
  const m = url.match(/\/uploads\/([^/]+)\/stream/);
  return m ? m[1] : null;
}

export function streamUrlFor(track: QueueTrack): string {
  return track.streamUrl ?? getStreamUrl(track.uploadId);
}

export function registerTracks(tracks: QueueTrack[]): void {
  tracks.forEach((t) => registry.set(streamUrlFor(t), t));
}

export function trackForUrl(url: string): QueueTrack | undefined {
  return registry.get(url);
}

// ── DSP settings → engine ────────────────────────────────────────────────────

/** Apply the 10-band EQ. Gains are in whole dB (matches the eqBands atom). */
export function applyEq(
  p: RockboxPlayer,
  enabled: boolean,
  bands: EqBandSetting[],
): void {
  p.setEqEnabled(enabled);
  // Band centre frequencies are fixed by index (the 10 rockbox bands) — never
  // trust a cutoff that may have been persisted from an older band table. Only
  // the gain is user data.
  bands.forEach((b, i) =>
    p.setEqBand(i, EQ_BANDS_HZ[i] ?? b.cutoff, EQ_Q, b.gain),
  );
}

/** Apply Rockbox crossfade. `Always` when enabled (fade every track change). */
export function applyCrossfade(
  p: RockboxPlayer,
  enabled: boolean,
  durationSec: number,
): void {
  p.setCrossfade(enabled ? CrossfadeMode.Always : CrossfadeMode.Off, {
    fadeInDuration: durationSec,
    fadeOutDuration: durationSec,
  });
}

/** Publish EQ state: remember it (for a late init) and push it live if ready. */
export function publishEq(enabled: boolean, bands: EqBandSetting[]): void {
  latestEq = { enabled, bands };
  if (player?.ready) applyEq(player, enabled, bands);
}

/** Publish crossfade state: remember + push live if the engine is running. */
export function publishCrossfade(enabled: boolean, durationSec: number): void {
  latestCrossfade = { enabled, durationSec };
  if (player?.ready) applyCrossfade(player, enabled, durationSec);
}
