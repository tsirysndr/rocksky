import AsyncStorage from "@react-native-async-storage/async-storage";
// Type-only, from the package root where it is re-exported: erased at
// compile time, so no extra module is pulled into the bundle.
import type { RemoteAudioSettings } from "@rocksky/sdk";
import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

// app.rocksky.rockbox.{getAudioSettings,putAudioSettings}: the user's audio
// settings record (app.rocksky.rockbox.audio.settings, rkey self) is the source
// of truth across devices — players read it and apply it, they never own it.
//
// Units are the lexicon's, which are rockbox's: TENTHS of a dB for band gain,
// precut and ReplayGain preamp, Q ×10, whole dB for bass/treble, ms for fades.
// Nothing is converted here, so what is stored is what the engines expect.

export type CrossfadeMode =
  | "disabled"
  | "enabled"
  | "shuffle"
  | "albumChange"
  | "trackChange";
export type ReplayGainMode =
  | "disabled"
  | "track"
  | "album"
  | "trackIfShuffling";
export type Channels =
  | "stereo"
  | "mono"
  | "monoLeft"
  | "monoRight"
  | "karaoke"
  | "wide";
export type FadeOutMixMode = "crossfade" | "mix";

export type EqBand = {
  /** Hz, 20..22000. */
  frequency: number;
  /** Tenths of a dB, -240..240. */
  gain: number;
  /** Q ×10, 5..640. */
  q: number;
};

export type EqualizerSettings = {
  enabled?: boolean;
  /** Tenths of a dB, -240..0 — a cut, so never positive. */
  precut?: number;
  bands?: EqBand[];
};

export type ToneSettings = {
  /** dB, -24..24. */
  bass?: number;
  /** dB, -24..24. */
  treble?: number;
  /** -100 (left) .. 100 (right). */
  balance?: number;
  channels?: Channels;
};

export type CrossfadeSettings = {
  mode?: CrossfadeMode;
  /** ms, 0..7000. */
  fadeInDelay?: number;
  /** ms, 0..15000. */
  fadeInDuration?: number;
  /** ms, 0..7000. */
  fadeOutDelay?: number;
  /** ms, 0..15000. */
  fadeOutDuration?: number;
  fadeOutMixMode?: FadeOutMixMode;
};

export type ReplayGainSettings = {
  mode?: ReplayGainMode;
  /** Tenths of a dB, -120..120. */
  preamp?: number;
  preventClipping?: boolean;
};

export type AudioSettings = {
  equalizer?: EqualizerSettings;
  tone?: ToneSettings;
  crossfade?: CrossfadeSettings;
  replayGain?: ReplayGainSettings;
  createdAt?: string;
  updatedAt?: string;
};

export type AudioSettingsPatch = {
  equalizer?: EqualizerSettings;
  tone?: ToneSettings;
  crossfade?: CrossfadeSettings;
  replayGain?: ReplayGainSettings;
};

/** The ten rockbox band centres, index-aligned with the record's bands. */
export const EQ_BANDS_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

/** Q 7.0, the firmware default, stored as tenths. */
export const EQ_Q = 70;

export const defaultBands = (): EqBand[] =>
  EQ_BANDS_HZ.map((frequency) => ({ frequency, gain: 0, q: EQ_Q }));

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  equalizer: { enabled: false, precut: 0, bands: defaultBands() },
  tone: { bass: 0, treble: 0, balance: 0, channels: "stereo" },
  crossfade: {
    mode: "disabled",
    fadeInDelay: 0,
    fadeInDuration: 2000,
    fadeOutDelay: 0,
    fadeOutDuration: 2000,
    fadeOutMixMode: "crossfade",
  },
  replayGain: { mode: "disabled", preamp: 0, preventClipping: false },
};

const authHeaders = () => ({
  authorization: `Bearer ${storage.getToken()}`,
});

/**
 * The caller's own settings. Identity comes from the bearer token, so there are
 * no params; a 404 means the user has no record yet, not an error.
 */
export const getAudioSettings = async (): Promise<AudioSettings | null> => {
  try {
    const response = await axios.get<AudioSettings>(
      `${API_URL}/xrpc/app.rocksky.rockbox.getAudioSettings`,
      { headers: authHeaders() },
    );
    return response.data ?? null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

/** Patch the record. Sections left out are untouched, so send only what moved. */
export const putAudioSettings = async (
  patch: AudioSettingsPatch,
): Promise<AudioSettings> => {
  const response = await axios.post<AudioSettings>(
    `${API_URL}/xrpc/app.rocksky.rockbox.putAudioSettings`,
    patch,
    { headers: authHeaders() },
  );
  return response.data;
};

// ─── This Device: survive a restart ──────────────────────────────────────────
//
// The record is the cross-device source of truth, but it needs the network. A
// local copy means the sheet opens on the settings the user left — and that
// This Device keeps them — before (or without) a round-trip.

const LOCAL_KEY = "audio-settings";

export const loadLocalAudioSettings =
  async (): Promise<AudioSettings | null> => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as AudioSettings) : null;
    } catch {
      return null;
    }
  };

export const saveLocalAudioSettings = async (
  settings: AudioSettings,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch {}
};

// ─── Remote players ──────────────────────────────────────────────────────────

// The record spells "no replay gain" / "no crossfade" as `disabled`; the remote
// protocol spells it `off`. Everything else — field names, tenths of a dB, Q ×10,
// milliseconds — is identical, so only the two enums are translated.
const WIRE_MODE = { disabled: "off" } as const;

/**
 * A settings patch as the remote-control protocol wants it (§6.1).
 *
 * Only the sections that changed are included, since an absent section means
 * "leave alone".
 */
export const toRemoteAudioSettings = (
  patch: AudioSettingsPatch,
): RemoteAudioSettings => ({
  ...(patch.equalizer
    ? {
        equalizer: {
          ...(patch.equalizer.enabled !== undefined
            ? { enabled: patch.equalizer.enabled }
            : {}),
          ...(patch.equalizer.precut !== undefined
            ? { precut: patch.equalizer.precut }
            : {}),
          ...(patch.equalizer.bands
            ? {
                bands: patch.equalizer.bands.map((band) => ({
                  frequency: band.frequency,
                  gain: band.gain,
                  q: band.q,
                })),
              }
            : {}),
        },
      }
    : {}),
  ...(patch.tone
    ? {
        tone: {
          ...(patch.tone.bass !== undefined ? { bass: patch.tone.bass } : {}),
          ...(patch.tone.treble !== undefined
            ? { treble: patch.tone.treble }
            : {}),
          ...(patch.tone.balance !== undefined
            ? { balance: patch.tone.balance }
            : {}),
        },
      }
    : {}),
  ...(patch.crossfade
    ? {
        crossfade: {
          ...(patch.crossfade.mode !== undefined
            ? {
                mode:
                  patch.crossfade.mode === "disabled"
                    ? WIRE_MODE.disabled
                    : patch.crossfade.mode,
              }
            : {}),
          ...(patch.crossfade.fadeInDelay !== undefined
            ? { fadeInDelay: patch.crossfade.fadeInDelay }
            : {}),
          ...(patch.crossfade.fadeInDuration !== undefined
            ? { fadeInDuration: patch.crossfade.fadeInDuration }
            : {}),
          ...(patch.crossfade.fadeOutDelay !== undefined
            ? { fadeOutDelay: patch.crossfade.fadeOutDelay }
            : {}),
          ...(patch.crossfade.fadeOutDuration !== undefined
            ? { fadeOutDuration: patch.crossfade.fadeOutDuration }
            : {}),
          ...(patch.crossfade.fadeOutMixMode !== undefined
            ? { fadeOutMixMode: patch.crossfade.fadeOutMixMode }
            : {}),
        },
      }
    : {}),
  ...(patch.replayGain
    ? {
        replayGain: {
          ...(patch.replayGain.mode !== undefined
            ? {
                mode:
                  patch.replayGain.mode === "disabled"
                    ? WIRE_MODE.disabled
                    : patch.replayGain.mode,
              }
            : {}),
          ...(patch.replayGain.preamp !== undefined
            ? { preamp: patch.replayGain.preamp }
            : {}),
          ...(patch.replayGain.preventClipping !== undefined
            ? { preventClipping: patch.replayGain.preventClipping }
            : {}),
        },
      }
    : {}),
});

/** Fill in whatever the record omits, so the controls always have a value. */
export const withDefaults = (settings: AudioSettings | null): AudioSettings => {
  const bands = settings?.equalizer?.bands;
  return {
    ...settings,
    equalizer: {
      ...DEFAULT_AUDIO_SETTINGS.equalizer,
      ...settings?.equalizer,
      // Band centres are physical constants keyed by index: only the gain and Q
      // are user data, so a record written against an older table can't move a
      // slider to the wrong frequency.
      bands: EQ_BANDS_HZ.map((frequency, index) => ({
        frequency,
        gain: bands?.[index]?.gain ?? 0,
        q: bands?.[index]?.q ?? EQ_Q,
      })),
    },
    tone: { ...DEFAULT_AUDIO_SETTINGS.tone, ...settings?.tone },
    crossfade: { ...DEFAULT_AUDIO_SETTINGS.crossfade, ...settings?.crossfade },
    replayGain: {
      ...DEFAULT_AUDIO_SETTINGS.replayGain,
      ...settings?.replayGain,
    },
  };
};
