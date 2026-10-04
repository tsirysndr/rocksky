// The app never plays audio itself — it remote-controls devices. A silent
// looping anchor track keeps an Android MediaSession (and its foreground
// service) alive so the notification mirrors the mini player and its buttons
// keep working in the background. Same trick as web-mobile's hidden <audio>.
//
// Everything goes through a lazy, guarded require: if the installed binary
// lacks the track-player native module (or its new-arch interop fails), the
// app runs without the notification instead of crashing.
const SILENCE = require("../../assets/audio/silence.wav");

type Rntp = typeof import("react-native-track-player");

let rntpModule: Rntp | null | undefined;

function rntp(): Rntp | null {
  if (rntpModule === undefined) {
    try {
      rntpModule = require("react-native-track-player");
      // Touch the module once so an interop failure surfaces here, not later.
      rntpModule?.default.getPlaybackState?.().catch?.(() => {});
    } catch (e) {
      console.warn("media session unavailable:", e);
      rntpModule = null;
    }
  }
  return rntpModule ?? null;
}

let ready = false;
let setupPromise: Promise<void> | null = null;
let hasTrack = false;
let lastKey = "";
let lastPlaying: boolean | null = null;

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
  await TrackPlayer.setRepeatMode(mod.RepeatMode.Track);
  await TrackPlayer.setVolume(0);
  ready = true;
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
};

export async function syncMediaSession(track: MediaSessionTrack | null) {
  const mod = rntp();
  if (!ready || !mod) return;
  const TrackPlayer = mod.default;
  try {
    if (!track || !track.title) {
      // Nothing playing anywhere: drop the notification entirely.
      if (hasTrack) {
        await TrackPlayer.reset();
        hasTrack = false;
        lastKey = "";
        lastPlaying = null;
      }
      return;
    }

    if (!hasTrack) {
      await TrackPlayer.add({
        url: SILENCE,
        title: track.title,
        artist: track.artist,
        artwork: track.cover || undefined,
      });
      hasTrack = true;
      lastKey = "";
      lastPlaying = null;
    }

    const key = `${track.title}\u0000${track.artist}\u0000${track.cover ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      await TrackPlayer.updateMetadataForTrack(0, {
        title: track.title,
        artist: track.artist,
        artwork: track.cover || undefined,
      });
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
