import { client } from ".";

// Wraps the app.rocksky.rockbox.{getAudioSettings,putAudioSettings} XRPC
// endpoints, which persist audio settings to the user's atproto record
// (app.rocksky.rockbox.audio.settings, rkey:self). This is the cross-device
// source of truth that survives container restarts.

// ── Wire types — match crates/api/lexicons/rockbox/defs.json ─────────────────
//
// Units on the wire (lexicon): gain/precut/preamp in TENTHS of dB, Q ×10.
// Same units rockbox uses internally, so no conversion at this layer.

export type CrossfadeMode = "disabled" | "enabled" | "shuffle" | "albumChange" | "trackChange";
export type ReplayGainMode = "disabled" | "track" | "album" | "trackIfShuffling";
export type Channels = "stereo" | "mono" | "monoLeft" | "monoRight" | "karaoke" | "wide";
export type FadeOutMixMode = "crossfade" | "mix";

export interface LexEqBand {
  frequency: number; // Hz
  gain: number;      // tenths of dB
  q: number;         // ×10
}

export interface LexEqualizer {
  enabled?: boolean;
  precut?: number;   // tenths of dB, ≤ 0
  bands?: LexEqBand[];
}

export interface LexTone {
  bass?: number;     // dB
  treble?: number;   // dB
  balance?: number;  // -100..+100
  channels?: Channels;
}

export interface LexCrossfade {
  mode?: CrossfadeMode;
  fadeInDelay?: number;     // ms
  fadeInDuration?: number;  // ms
  fadeOutDelay?: number;    // ms
  fadeOutDuration?: number; // ms
  fadeOutMixMode?: FadeOutMixMode;
}

export interface LexReplayGain {
  mode?: ReplayGainMode;
  preamp?: number;          // tenths of dB
  preventClipping?: boolean;
}

export interface AudioSettingsView {
  equalizer?: LexEqualizer;
  tone?: LexTone;
  crossfade?: LexCrossfade;
  replayGain?: LexReplayGain;
  createdAt: string;
  updatedAt?: string;
}

export interface AudioSettingsPatch {
  equalizer?: LexEqualizer;
  tone?: LexTone;
  crossfade?: LexCrossfade;
  replayGain?: LexReplayGain;
}

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

// Fetch the caller's own settings (auth required).
export async function getAudioSettings(): Promise<AudioSettingsView | null> {
  try {
    const res = await client.get<AudioSettingsView>(
      "/xrpc/app.rocksky.rockbox.getAudioSettings",
      { headers: authHeader() },
    );
    return res.data;
  } catch (e: unknown) {
    // 404 = no record yet for this user. Treat as "fresh user, no settings".
    if (typeof e === "object" && e !== null && "response" in e) {
      const resp = (e as { response?: { status?: number } }).response;
      if (resp?.status === 404) return null;
    }
    throw e;
  }
}

// Fetch any user's settings publicly (no auth). Mostly here for symmetry; the
// web UI doesn't need it today.
export async function getAudioSettingsByDid(did: string): Promise<AudioSettingsView | null> {
  try {
    const res = await client.get<AudioSettingsView>(
      "/xrpc/app.rocksky.rockbox.getAudioSettings",
      { params: { did } },
    );
    return res.data;
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "response" in e) {
      const resp = (e as { response?: { status?: number } }).response;
      if (resp?.status === 404) return null;
    }
    throw e;
  }
}

export async function putAudioSettings(patch: AudioSettingsPatch): Promise<AudioSettingsView> {
  const res = await client.post<AudioSettingsView>(
    "/xrpc/app.rocksky.rockbox.putAudioSettings",
    patch,
    { headers: authHeader() },
  );
  return res.data;
}
