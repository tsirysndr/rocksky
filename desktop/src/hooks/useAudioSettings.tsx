import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useRef } from "react";
import { profileAtom } from "../atoms/profile";
import type {
  AudioSettingsPatch,
  AudioSettingsView,
  Channels,
  CrossfadeMode,
  FadeOutMixMode,
  LexCrossfade,
  LexEqBand,
  LexEqualizer,
  LexReplayGain,
  LexTone,
  ReplayGainMode,
} from "../api/audio-settings";
import { getAudioSettings, putAudioSettings } from "../api/audio-settings";
import {
  DEFAULT_GLOBAL_SETTINGS,
  type EqBand,
  type GlobalSettings,
  publishAudioSettings,
} from "../lib/audio/rockbox-engine";
import type { RemoteAudioSettings } from "@rocksky/sdk";
import { deviceCommandAtom } from "../atoms/devices";

// useAudioSettings — single source of truth for audio (DSP) settings.
//
//   ┌─ in-browser wasm engine (live) ──────────┐
//   │  What the rockbox-wasm DSP chain uses now │
//   └──────────────────────────────────────────┘
//             ▲ publishAudioSettings on change
//             │
//   ┌─────────┴── useAudioSettings ────────────┐
//   │  - `settingsAtom` (localStorage) holds    │
//   │    the authoritative snapshot on-device   │
//   │  - on change: update atom → engine + PDS  │
//   │  - on mount: hydrate atom from the PDS     │
//   │    lexicon once (cross-device settings)    │
//   └──────────────────────────────────────────┘
//             ▲ debounced putAudioSettings
//             ▼
//   ┌─── app.rocksky.rockbox.{get,put}AudioSettings ──┐
//   │  Persisted to atproto — survives reloads, syncs │
//   │  across devices.                                │
//   └─────────────────────────────────────────────────┘
//
// The former remote rockbox server (GraphQL saveSettings) is gone: settings now
// live in localStorage + the atproto lexicon, and are pushed to the local wasm
// engine. There is no network call in the audible path.

// ── Enum conversions (lexicon ↔ GlobalSettings ints) ─────────────────────────

const REPEAT_MODE_NAMES = ["off", "all", "one", "shuffle", "ab"] as const;
export type RepeatMode = (typeof REPEAT_MODE_NAMES)[number];

const CROSSFADE_MODE_TO_INT: Record<CrossfadeMode, number> = {
  disabled: 0,
  enabled: 1,
  shuffle: 2,
  albumChange: 3,
  trackChange: 4,
};
const CROSSFADE_INT_TO_MODE: CrossfadeMode[] = [
  "disabled", "enabled", "shuffle", "albumChange", "trackChange",
];

const REPLAYGAIN_TO_INT: Record<ReplayGainMode, number> = {
  disabled: 0,
  track: 1,
  album: 2,
  trackIfShuffling: 3,
};
const REPLAYGAIN_INT_TO_MODE: ReplayGainMode[] = [
  "disabled", "track", "album", "trackIfShuffling",
];

const CHANNELS_TO_INT: Record<Channels, number> = {
  stereo: 0,
  mono: 1,
  monoLeft: 3,
  monoRight: 4,
  karaoke: 5,
  wide: 2,
};
const CHANNELS_INT_TO_NAME: Channels[] = [
  "stereo", "mono", "wide", "monoLeft", "monoRight", "karaoke",
];

const FADE_MIX_TO_INT: Record<FadeOutMixMode, number> = { crossfade: 0, mix: 1 };

function bandLexToRockbox(b: LexEqBand): EqBand {
  return { cutoff: b.frequency, gain: b.gain, q: b.q };
}
function bandRockboxToLex(b: EqBand): LexEqBand {
  return { frequency: b.cutoff, gain: b.gain, q: b.q };
}

// ── On-device authoritative settings snapshot ────────────────────────────────
//
// Persisted to localStorage so the DSP chain survives reloads without a network
// round-trip. Seeded from firmware defaults; hydrated from the lexicon on mount.

// Exported so an always-mounted publisher (useAudioSettingsPublisher) can push
// it to the engine on app load — without it, the settings only reach the engine
// when the Audio Settings page/EQ modal mounts, and the flat default gets
// applied for a render first (audible EQ flicker on first open).
// getOnInit reads localStorage synchronously so the very first render already
// has the stored settings, not the flat default.
export const audioSettingsAtom = atomWithStorage<GlobalSettings>(
  "rocksky:audio.settings",
  DEFAULT_GLOBAL_SETTINGS,
  undefined,
  { getOnInit: true },
);
const settingsAtom = audioSettingsAtom;

/** Always-mounted: keep the engine's DSP chain in sync with the persisted audio
 *  settings from app load on, so opening Audio Settings later applies nothing
 *  new (publishAudioSettings is idempotent) and there's no audible flicker. */
export function useAudioSettingsPublisher(): void {
  const settings = useAtomValue(audioSettingsAtom);
  const device = useAtomValue(deviceCommandAtom);
  // The last document sent to a device. Starts as the on-load snapshot WITHOUT
  // sending: the device's baseline is the atproto record (playerd syncs it
  // itself), so a device only ever gets what changed here after load. Pushing
  // the whole local snapshot on every open made every open client re-impose
  // its own (possibly stale) copy — with two clients open the device's DSP
  // flipped between the two, and each re-apply audibly dipped the volume.
  const lastSentToDevice = useRef<string | null>(null);
  useEffect(() => {
    // While a remote device is the source, the local engine isn't the thing
    // making sound — send the settings to the device instead. It applies the
    // sections its engine implements and ignores the rest.
    if (device.active) {
      const doc = toRemoteAudioSettings(settings);
      const json = JSON.stringify(doc);
      if (lastSentToDevice.current === null || lastSentToDevice.current === json) {
        lastSentToDevice.current = json;
        return;
      }
      lastSentToDevice.current = json;
      device.send("audio_settings", doc);
      return;
    }
    lastSentToDevice.current = null;
    publishAudioSettings(settings);
  }, [settings, device]);
}

/** Merge a lexicon record into a GlobalSettings snapshot. Anything the lexicon
 *  doesn't specify keeps its current value. */
function applyLexiconToSettings(
  base: GlobalSettings,
  lex: AudioSettingsView | null,
): GlobalSettings {
  if (!lex) return base;
  const out: GlobalSettings = { ...base };
  if (lex.equalizer) {
    if (lex.equalizer.enabled !== undefined) out.eqEnabled = lex.equalizer.enabled;
    if (lex.equalizer.precut !== undefined) out.eqPrecut = lex.equalizer.precut;
    if (lex.equalizer.bands) out.eqBandSettings = lex.equalizer.bands.map(bandLexToRockbox);
  }
  if (lex.tone) {
    if (lex.tone.bass !== undefined) out.bass = lex.tone.bass;
    if (lex.tone.treble !== undefined) out.treble = lex.tone.treble;
    if (lex.tone.balance !== undefined) out.balance = lex.tone.balance;
    if (lex.tone.channels) out.channelConfig = CHANNELS_TO_INT[lex.tone.channels];
  }
  if (lex.crossfade) {
    if (lex.crossfade.mode) out.crossfade = CROSSFADE_MODE_TO_INT[lex.crossfade.mode];
    if (lex.crossfade.fadeInDelay !== undefined)
      out.crossfadeFadeInDelay = Math.round(lex.crossfade.fadeInDelay / 1000);
    if (lex.crossfade.fadeInDuration !== undefined)
      out.crossfadeFadeInDuration = Math.round(lex.crossfade.fadeInDuration / 1000);
    if (lex.crossfade.fadeOutDelay !== undefined)
      out.crossfadeFadeOutDelay = Math.round(lex.crossfade.fadeOutDelay / 1000);
    if (lex.crossfade.fadeOutDuration !== undefined)
      out.crossfadeFadeOutDuration = Math.round(lex.crossfade.fadeOutDuration / 1000);
    if (lex.crossfade.fadeOutMixMode)
      out.crossfadeFadeOutMixmode = FADE_MIX_TO_INT[lex.crossfade.fadeOutMixMode];
  }
  if (lex.replayGain) {
    out.replaygainSettings = { ...out.replaygainSettings };
    if (lex.replayGain.mode) out.replaygainSettings.type = REPLAYGAIN_TO_INT[lex.replayGain.mode];
    if (lex.replayGain.preamp !== undefined) out.replaygainSettings.preamp = lex.replayGain.preamp;
    if (lex.replayGain.preventClipping !== undefined)
      out.replaygainSettings.noclip = lex.replayGain.preventClipping;
  }
  return out;
}

// ── Debounced lexicon persistence (per section) ──────────────────────────────

const LEXICON_DEBOUNCE_MS = 800;
type SectionKey = "equalizer" | "tone" | "crossfade" | "replayGain";

const pendingLexicon: Record<
  SectionKey,
  {
    patch: LexEqualizer | LexTone | LexCrossfade | LexReplayGain;
    timer: ReturnType<typeof setTimeout> | null;
  }
> = {
  equalizer: { patch: {}, timer: null },
  tone: { patch: {}, timer: null },
  crossfade: { patch: {}, timer: null },
  replayGain: { patch: {}, timer: null },
};

async function flushLexicon(section: SectionKey): Promise<void> {
  const sec = pendingLexicon[section];
  if (Object.keys(sec.patch).length === 0) return;
  const patch = sec.patch;
  sec.patch = {};
  const wrapped: AudioSettingsPatch = { [section]: patch };
  try {
    await putAudioSettings(wrapped);
  } catch (err) {
    console.warn(`[useAudioSettings] lexicon ${section} save failed`, err);
  }
}

function scheduleLexiconFlush(
  section: SectionKey,
  patch: LexEqualizer | LexTone | LexCrossfade | LexReplayGain,
): void {
  const sec = pendingLexicon[section];
  Object.assign(sec.patch, patch);
  if (sec.timer) clearTimeout(sec.timer);
  sec.timer = setTimeout(() => {
    sec.timer = null;
    void flushLexicon(section);
  }, LEXICON_DEBOUNCE_MS);
}

export type EqMutation = { enabled?: boolean; bands?: EqBand[]; precut?: number };

export interface AudioSettingsActions {
  setEqualizer(patch: EqMutation): void;
  setTone(patch: { bass?: number; treble?: number; balance?: number; channels?: Channels }): void;
  setCrossfade(patch: {
    mode?: CrossfadeMode;
    fadeInDelay?: number;
    fadeInDuration?: number;
    fadeOutDelay?: number;
    fadeOutDuration?: number;
    fadeOutMixMode?: FadeOutMixMode;
  }): void;
  setReplayGain(patch: { mode?: ReplayGainMode; preamp?: number; preventClipping?: boolean }): void;
}

// ── Full-section lexicon projections ─────────────────────────────────────────

const fullEqualizerLex = (s: GlobalSettings): LexEqualizer => ({
  enabled: s.eqEnabled,
  precut: s.eqPrecut ?? 0,
  bands: s.eqBandSettings.map(bandRockboxToLex),
});

const fullToneLex = (s: GlobalSettings): LexTone => ({
  bass: s.bass,
  treble: s.treble,
  balance: s.balance,
  channels: CHANNELS_INT_TO_NAME[s.channelConfig] ?? "stereo",
});

const fullCrossfadeLex = (s: GlobalSettings): LexCrossfade => ({
  mode: CROSSFADE_INT_TO_MODE[s.crossfade] ?? "disabled",
  fadeInDelay: Math.round(s.crossfadeFadeInDelay * 1000),
  fadeInDuration: Math.round(s.crossfadeFadeInDuration * 1000),
  fadeOutDelay: Math.round(s.crossfadeFadeOutDelay * 1000),
  fadeOutDuration: Math.round(s.crossfadeFadeOutDuration * 1000),
  fadeOutMixMode: s.crossfadeFadeOutMixmode === 1 ? "mix" : "crossfade",
});

const fullReplayGainLex = (s: GlobalSettings): LexReplayGain => ({
  mode: REPLAYGAIN_INT_TO_MODE[s.replaygainSettings.type] ?? "disabled",
  preamp: s.replaygainSettings.preamp,
  preventClipping: s.replaygainSettings.noclip,
});

// Module-level guard so lexicon hydration runs ONCE per (did, app session).
const hydratedDids = new Set<string>();

export function useAudioSettings(): {
  data: GlobalSettings | undefined;
  isLoading: boolean;
  isError: boolean;
  actions: AudioSettingsActions;
} {
  const profile = useAtomValue(profileAtom);
  const did = profile?.did ?? "";
  useQueryClient();
  const [settings, setSettings] = useAtom(settingsAtom);

  // Fetch the cross-device lexicon record (for hydration).
  const lexiconQ = useQuery({
    queryKey: ["audio-settings", "lexicon"],
    queryFn: getAudioSettings,
    enabled: !!did,
    staleTime: 60_000,
  });

  // Engine sync lives in the always-mounted useAudioSettingsPublisher (mounted
  // by the sticky player) so the DSP chain is in sync from app load — not only
  // while this settings-page hook is mounted.

  // Hydrate the local snapshot from the lexicon ONCE per did.
  useEffect(() => {
    if (!did) return;
    if (lexiconQ.data === undefined) return; // still loading
    if (hydratedDids.has(did)) return;
    hydratedDids.add(did);
    if (lexiconQ.data === null) return; // no record yet — keep local defaults
    setSettings((prev) => applyLexiconToSettings(prev, lexiconQ.data));
  }, [did, lexiconQ.data, setSettings]);

  // Lexicon flushes carry the FULL section, not just the changed fields:
  // putRecord-based writers replace sections wholesale, so a sparse patch
  // would wipe every field it doesn't mention (bands lost on a precut tweak).
  // Full sections keep the stored record complete no matter how it is merged.
  const actions: AudioSettingsActions = {
    setEqualizer(patch) {
      let lexicon: LexEqualizer = {};
      setSettings((prev) => {
        const next = { ...prev };
        if (patch.enabled !== undefined) next.eqEnabled = patch.enabled;
        if (patch.bands !== undefined) next.eqBandSettings = patch.bands;
        if (patch.precut !== undefined) next.eqPrecut = patch.precut;
        lexicon = fullEqualizerLex(next);
        return next;
      });
      scheduleLexiconFlush("equalizer", lexicon);
    },

    setTone(patch) {
      let lex: LexTone = {};
      setSettings((prev) => {
        const next = { ...prev };
        if (patch.bass !== undefined) next.bass = patch.bass;
        if (patch.treble !== undefined) next.treble = patch.treble;
        if (patch.balance !== undefined) next.balance = patch.balance;
        if (patch.channels !== undefined) next.channelConfig = CHANNELS_TO_INT[patch.channels];
        lex = fullToneLex(next);
        return next;
      });
      scheduleLexiconFlush("tone", lex);
    },

    setCrossfade(patch) {
      let lex: LexCrossfade = {};
      setSettings((prev) => {
        const next = { ...prev };
        if (patch.mode !== undefined) next.crossfade = CROSSFADE_MODE_TO_INT[patch.mode];
        // lexicon uses ms; GlobalSettings uses seconds.
        if (patch.fadeInDelay !== undefined)
          next.crossfadeFadeInDelay = Math.round(patch.fadeInDelay / 1000);
        if (patch.fadeInDuration !== undefined)
          next.crossfadeFadeInDuration = Math.round(patch.fadeInDuration / 1000);
        if (patch.fadeOutDelay !== undefined)
          next.crossfadeFadeOutDelay = Math.round(patch.fadeOutDelay / 1000);
        if (patch.fadeOutDuration !== undefined)
          next.crossfadeFadeOutDuration = Math.round(patch.fadeOutDuration / 1000);
        if (patch.fadeOutMixMode !== undefined)
          next.crossfadeFadeOutMixmode = FADE_MIX_TO_INT[patch.fadeOutMixMode];
        lex = fullCrossfadeLex(next);
        return next;
      });
      scheduleLexiconFlush("crossfade", lex);
    },

    setReplayGain(patch) {
      let lex: LexReplayGain = {};
      setSettings((prev) => {
        const cur = prev.replaygainSettings;
        const replaygainSettings = {
          noclip: patch.preventClipping ?? cur.noclip,
          type: patch.mode !== undefined ? REPLAYGAIN_TO_INT[patch.mode] : cur.type,
          preamp: patch.preamp ?? cur.preamp,
        };
        const next = { ...prev, replaygainSettings };
        lex = fullReplayGainLex(next);
        return next;
      });
      scheduleLexiconFlush("replayGain", lex);
    },
  };

  return {
    data: settings,
    isLoading: false,
    isError: lexiconQ.isError,
    actions,
  };
}

// Convenience re-exports for view code.
export {
  CROSSFADE_INT_TO_MODE,
  REPLAYGAIN_INT_TO_MODE,
  CHANNELS_INT_TO_NAME,
  REPEAT_MODE_NAMES,
};

// ── Remote devices ───────────────────────────────────────────────────────────

/**
 * Project the settings snapshot onto the remote-control protocol's audio
 * document (see remote-ws/PROTOCOL.md §6.1), so the same settings the local
 * engine gets can be sent verbatim to whichever device is playing.
 *
 * The vocabularies differ where the protocol follows the lexicon: `disabled`
 * is `off` there, and the `wide` channel mode is `custom`. Fade times are
 * seconds here and milliseconds on the wire.
 *
 * Every section is sent; a player applies the ones its engine implements and
 * ignores the rest, so there is nothing to negotiate first.
 */
export function toRemoteAudioSettings(s: GlobalSettings): RemoteAudioSettings {
  const crossfade = CROSSFADE_INT_TO_MODE[s.crossfade] ?? "disabled";
  const channels = CHANNELS_INT_TO_NAME[s.channelConfig] ?? "stereo";
  const replaygain = REPLAYGAIN_INT_TO_MODE[s.replaygainSettings.type] ?? "disabled";
  return {
    equalizer: {
      enabled: s.eqEnabled,
      precut: s.eqPrecut,
      bands: s.eqBandSettings.map(bandRockboxToLex),
    },
    tone: {
      bass: s.bass,
      treble: s.treble,
      bassCutoff: s.bassCutoff,
      trebleCutoff: s.trebleCutoff,
      balance: s.balance,
      channels: channels === "wide" ? "custom" : channels,
      stereoWidth: s.stereoWidth,
    },
    crossfade: {
      mode: crossfade === "disabled" ? "off" : crossfade,
      fadeInDelay: Math.round(s.crossfadeFadeInDelay * 1000),
      fadeInDuration: Math.round(s.crossfadeFadeInDuration * 1000),
      fadeOutDelay: Math.round(s.crossfadeFadeOutDelay * 1000),
      fadeOutDuration: Math.round(s.crossfadeFadeOutDuration * 1000),
      fadeOutMixMode: s.crossfadeFadeOutMixmode === 1 ? "mix" : "crossfade",
    },
    replayGain: {
      mode: replaygain === "disabled" ? "off" : replaygain,
      preamp: s.replaygainSettings.preamp,
      preventClipping: s.replaygainSettings.noclip,
    },
  };
}
