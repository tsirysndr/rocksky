// The app never plays audio itself — it remote-controls devices. A silent
// 2-hour FLAC anchor keeps an Android MediaSession (and its foreground
// service) alive: the anchor is seeked to the remote track's real position
// and carries its real duration, so the notification's metadata, progress
// bar, and buttons all mirror the remote player. Same idea as web-mobile's
// hidden <audio>, extended with real progress.
//
// Everything goes through a lazy, guarded require: if the installed binary
// lacks the track-player native module (or its new-arch interop fails), the
// app runs without the notification instead of crashing.
const SILENCE = require("../../assets/audio/silence.flac");

type Rntp = typeof import("react-native-track-player");

let rntpModule: Rntp | null | undefined;

function rntp(): Rntp | null {
  if (rntpModule === undefined) {
    try {
      rntpModule = require("react-native-track-player");
    } catch (e) {
      console.warn("media session unavailable:", e);
      rntpModule = null;
    }
  }
  return rntpModule ?? null;
}

let ready = false;
let setupPromise: Promise<void> | null = null;
// Sync requests that arrive while the player is still initializing are
// replayed once setup completes (otherwise an unchanging track never syncs).
let pendingTrack: MediaSessionTrack | null | undefined;
let hasTrack = false;
let lastKey = "";
let lastPlaying: boolean | null = null;
let lastDurationMs = 0;

async function doSetup() {
  const mod = rntp();
  if (!mod) return;
  const TrackPlayer = mod.default;
  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: false });
  } catch (e) {
    // Already initialized (fast refresh / remount) — safe to continue.
    if (!String(e).includes("already been initialized")) throw e;
  }
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior:
        mod.AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [
      mod.Capability.Play,
      mod.Capability.Pause,
      mod.Capability.SkipToNext,
      mod.Capability.SkipToPrevious,
    ],
    compactCapabilities: [
      mod.Capability.Play,
      mod.Capability.Pause,
      mod.Capability.SkipToNext,
    ],
  });
  await TrackPlayer.setRepeatMode(mod.RepeatMode.Off);
  await TrackPlayer.setVolume(0);
  ready = true;
  if (pendingTrack !== undefined) {
    const replay = pendingTrack;
    pendingTrack = undefined;
    await syncMediaSession(replay);
  }
}

export function setupMediaSession(): Promise<void> {
  if (!setupPromise) {
    setupPromise = doSetup().catch((e) => {
      console.warn("media session setup failed:", e);
      setupPromise = null;
    }) as Promise<void>;
  }
  return setupPromise;
}

export type MediaSessionTrack = {
  title: string;
  artist: string;
  cover?: string;
  isPlaying: boolean;
  durationMs: number;
  progressMs: number;
};

export async function syncMediaSession(track: MediaSessionTrack | null) {
  const mod = rntp();
  if (!mod) return;
  if (!ready) {
    pendingTrack = track;
    return;
  }
  const TrackPlayer = mod.default;
  try {
    if (!track || !track.title) {
      // Nothing playing anywhere: drop the notification entirely.
      if (hasTrack) {
        await TrackPlayer.reset();
        hasTrack = false;
        lastKey = "";
        lastPlaying = null;
        lastDurationMs = 0;
      }
      return;
    }

    const durationSec =
      track.durationMs > 0 ? track.durationMs / 1000 : undefined;

    if (!hasTrack) {
      await TrackPlayer.add({
        url: SILENCE,
        title: track.title,
        artist: track.artist,
        artwork: track.cover || undefined,
        duration: durationSec,
      });
      hasTrack = true;
      lastKey = "";
      lastPlaying = null;
      lastDurationMs = 0;
    }

    const key = `${track.title}\u0000${track.artist}\u0000${track.cover ?? ""}`;
    if (key !== lastKey || track.durationMs !== lastDurationMs) {
      lastKey = key;
      lastDurationMs = track.durationMs;
      // overrideMetadata path: refreshes the live notification, unlike
      // updateMetadataForTrack which only swaps the queue item.
      await TrackPlayer.updateNowPlayingMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.cover || undefined,
        duration: durationSec,
      });
      // New track: snap the anchor to the remote position.
      await TrackPlayer.seekTo(track.progressMs / 1000);
    }

    if (track.isPlaying !== lastPlaying) {
      lastPlaying = track.isPlaying;
      if (track.isPlaying) await TrackPlayer.play();
      else await TrackPlayer.pause();
    }
  } catch {
    // Media session failures must never break playback state handling.
  }
}

// Periodic drift correction: the anchor free-runs at 1x, so it only needs a
// nudge when the remote position jumps (seek, buffering, reconnect).
export async function syncMediaPosition(progressMs: number) {
  const mod = rntp();
  if (!ready || !hasTrack || !mod) return;
  try {
    const { position } = await mod.default.getProgress();
    if (Math.abs(position * 1000 - progressMs) > 3000) {
      await mod.default.seekTo(progressMs / 1000);
    }
  } catch {}
}

// Called by the notification service for immediate visual feedback — the real
// state follows from the device echo through the atoms.
export async function reflectPlaying(playing: boolean) {
  const mod = rntp();
  if (!ready || !hasTrack || !mod) return;
  lastPlaying = playing;
  try {
    if (playing) await mod.default.play();
    else await mod.default.pause();
  } catch {}
}
