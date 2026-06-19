import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
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
import {
  getAudioSettings,
  putAudioSettings,
} from "../api/audio-settings";
import {
  type EqBand,
  type GlobalSettings,
  type SettingsPatch,
  getGlobalSettings,
  saveSettings,
} from "../lib/rockbox-graphql";

// useAudioSettings — single source of truth for audio settings across the UI.
//
//   ┌─ rockbox (per-DID, ephemeral) ───────────┐
//   │  Live values; what the codec uses now    │
//   └──────────────────────────────────────────┘
//             ▲              │
//   push on   │              │ initial fetch (firmware defaults
//   change ──┐│              │ for a fresh container)
//            ││              ▼
//   ┌────────┴──── useAudioSettings ───────────┐
//   │  - lexicon = cross-device authoritative  │
//   │  - rockbox = live in-container state     │
//   │  - on mount: lexicon → rockbox (once,    │
//   │    so a freshly-booted container picks   │
//   │    up the user's saved settings)         │
//   │  - on change: write to BOTH              │
//   └──────────────────────────────────────────┘
//             ▲              │
//   push on   │              │
//   change    │              ▼
//   ┌─────────┴── audio.settings lexicon ──────┐
//   │  Persisted to atproto, survives container│
//   │  restarts + works across devices         │
//   └──────────────────────────────────────────┘

// ── Unit + enum conversion helpers (lexicon ↔ rockbox-graphql) ───────────────

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

// Merge a lexicon record into the live rockbox state representation. Anything
// the lexicon doesn't specify falls through to whatever rockbox already has.
function applyLexiconToRockbox(
  base: GlobalSettings,
  lex: AudioSettingsView | null,
): GlobalSettings {
  if (!lex) return base;
  const out: GlobalSettings = { ...base };
  if (lex.equalizer) {
    if (lex.equalizer.enabled !== undefined) out.eqEnabled = lex.equalizer.enabled;
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

// ── Per-section patch builders ───────────────────────────────────────────────
//
// Each `set*` action merges into a per-section pending patch. Rockbox is the
// audible path → throttle (leading + trailing) so the codec tracks the slider
// in near-realtime without hammering the per-IP rate limiter inside the Fly
// container. Lexicon persistence only needs the final value → debounce
// trailing-only.

const ROCKBOX_THROTTLE_MS = 120;
const LEXICON_DEBOUNCE_MS = 800;

const QK_ROCKBOX = ["audio-settings", "rockbox"] as const;
const QK_LEXICON = ["audio-settings", "lexicon"] as const;

type SectionKey = "equalizer" | "tone" | "crossfade" | "replayGain";

interface SectionState {
  rockbox: SettingsPatch;
  // Per-section lexicon payload (LexEqualizer for equalizer, etc.) — wrapped
  // into AudioSettingsPatch.{section} at flush time.
  lexicon: LexEqualizer | LexTone | LexCrossfade | LexReplayGain;
  rockboxTimer: ReturnType<typeof setTimeout> | null;
  lexiconTimer: ReturnType<typeof setTimeout> | null;
  rockboxLastRun: number; // performance.now() at last flush
}

interface DidState {
  equalizer: SectionState;
  tone: SectionState;
  crossfade: SectionState;
  replayGain: SectionState;
  qc: QueryClient;
}

const stateByDid = new Map<string, DidState>();

function newSection(): SectionState {
  return {
    rockbox: {},
    lexicon: {},
    rockboxTimer: null,
    lexiconTimer: null,
    rockboxLastRun: 0,
  };
}

function getDidState(did: string, qc: QueryClient): DidState {
  let s = stateByDid.get(did);
  if (!s) {
    s = {
      equalizer: newSection(),
      tone: newSection(),
      crossfade: newSection(),
      replayGain: newSection(),
      qc,
    };
    stateByDid.set(did, s);
  } else {
    // Keep the freshest QueryClient — survives hook remounts.
    s.qc = qc;
  }
  return s;
}

// Mirror the rockbox-side patch into the React Query cache so reads pick up
// the slider's new position immediately, before the network round-trip lands.
function applyRockboxPatchToCache(
  qc: QueryClient,
  did: string,
  patch: SettingsPatch,
): void {
  qc.setQueryData<GlobalSettings>([...QK_ROCKBOX, did], (prev) => {
    if (!prev) return prev;
    const next: GlobalSettings = { ...prev };
    if (patch.eqEnabled !== undefined) next.eqEnabled = patch.eqEnabled;
    if (patch.eqBandSettings) next.eqBandSettings = patch.eqBandSettings;
    if (patch.bass !== undefined) next.bass = patch.bass;
    if (patch.treble !== undefined) next.treble = patch.treble;
    if (patch.balance !== undefined) next.balance = patch.balance;
    if (patch.channelConfig !== undefined) next.channelConfig = patch.channelConfig;
    if (patch.crossfade !== undefined) next.crossfade = patch.crossfade;
    if (patch.fadeInDelay !== undefined) next.crossfadeFadeInDelay = patch.fadeInDelay;
    if (patch.fadeInDuration !== undefined)
      next.crossfadeFadeInDuration = patch.fadeInDuration;
    if (patch.fadeOutDelay !== undefined) next.crossfadeFadeOutDelay = patch.fadeOutDelay;
    if (patch.fadeOutDuration !== undefined)
      next.crossfadeFadeOutDuration = patch.fadeOutDuration;
    if (patch.fadeOutMixmode !== undefined)
      next.crossfadeFadeOutMixmode = patch.fadeOutMixmode;
    if (patch.replaygainSettings) next.replaygainSettings = patch.replaygainSettings;
    return next;
  });
}

async function flushRockbox(did: string, section: SectionKey): Promise<void> {
  const s = stateByDid.get(did);
  if (!s) return;
  const sec = s[section];
  if (Object.keys(sec.rockbox).length === 0) return;
  const patch = sec.rockbox;
  sec.rockbox = {};
  sec.rockboxLastRun = performance.now();
  try {
    await saveSettings(did, patch);
  } catch (err) {
    console.warn(`[useAudioSettings] rockbox ${section} save failed`, err);
    // Refetch so the UI converges back on what the codec actually has.
    // Swallow invalidation errors — the next staleTime tick will refetch anyway.
    s.qc.invalidateQueries({ queryKey: [...QK_ROCKBOX, did] }).catch(() => undefined);
  }
}

function scheduleRockboxFlush(did: string, section: SectionKey): void {
  const s = stateByDid.get(did);
  if (!s) return;
  const sec = s[section];
  const now = performance.now();
  const elapsed = now - sec.rockboxLastRun;

  // Leading edge: fire immediately if we're outside the throttle window. Keeps
  // the first slider move feeling instant.
  if (sec.rockboxLastRun === 0 || elapsed >= ROCKBOX_THROTTLE_MS) {
    if (sec.rockboxTimer) {
      clearTimeout(sec.rockboxTimer);
      sec.rockboxTimer = null;
    }
    void flushRockbox(did, section);
    return;
  }

  // Trailing edge: coalesce subsequent ticks into one flush at window end.
  if (sec.rockboxTimer) return;
  sec.rockboxTimer = setTimeout(() => {
    sec.rockboxTimer = null;
    void flushRockbox(did, section);
  }, ROCKBOX_THROTTLE_MS - elapsed);
}

async function flushLexicon(did: string, section: SectionKey): Promise<void> {
  const s = stateByDid.get(did);
  if (!s) return;
  const sec = s[section];
  if (Object.keys(sec.lexicon).length === 0) return;
  const patch = sec.lexicon;
  sec.lexicon = {};
  const wrapped: AudioSettingsPatch = { [section]: patch };
  try {
    await putAudioSettings(wrapped);
  } catch (err) {
    console.warn(`[useAudioSettings] lexicon ${section} save failed`, err);
  }
}

function scheduleLexiconFlush(did: string, section: SectionKey): void {
  const s = stateByDid.get(did);
  if (!s) return;
  const sec = s[section];
  if (sec.lexiconTimer) clearTimeout(sec.lexiconTimer);
  sec.lexiconTimer = setTimeout(() => {
    sec.lexiconTimer = null;
    void flushLexicon(did, section);
  }, LEXICON_DEBOUNCE_MS);
}

function enqueue(
  did: string,
  qc: QueryClient,
  section: SectionKey,
  rockbox: SettingsPatch,
  lexicon: LexEqualizer | LexTone | LexCrossfade | LexReplayGain,
): void {
  const s = getDidState(did, qc);
  const sec = s[section];
  // Shallow merge — each action's patch already carries cumulative slider
  // state (consumers read from `rockboxQ.data` which we keep current via
  // applyRockboxPatchToCache), so the later patch supersedes the earlier one.
  Object.assign(sec.rockbox, rockbox);
  Object.assign(sec.lexicon, lexicon);
  applyRockboxPatchToCache(qc, did, rockbox);
  scheduleRockboxFlush(did, section);
  scheduleLexiconFlush(did, section);
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

// ── Hook ─────────────────────────────────────────────────────────────────────

// Module-level guard so hydration runs ONCE per (did, app session) — not once
// per useAudioSettings mount. Without this, every navigation that re-mounts
// the hook (settings page, EQ modal) would re-push to rockbox and interrupt
// the codec, dropping playback to silence.
const hydratedDids = new Set<string>();

export function useAudioSettings(): {
  data: GlobalSettings | undefined;
  isLoading: boolean;
  isError: boolean;
  actions: AudioSettingsActions;
} {
  const profile = useAtomValue(profileAtom);
  const did = profile?.did ?? "";
  const qc = useQueryClient();

  const rockboxQ = useQuery({
    queryKey: [...QK_ROCKBOX, did],
    queryFn: () => getGlobalSettings(did),
    enabled: !!did,
    staleTime: 30_000,
  });
  const lexiconQ = useQuery({
    queryKey: [...QK_LEXICON],
    queryFn: getAudioSettings,
    enabled: !!did,
    staleTime: 60_000,
  });

  // Hydrate rockbox from atproto ONCE per (did, container generation).
  //
  // The contract is explicit and per-section:
  //   - If the user HAS atproto settings for a section → push that section to
  //     rockbox (single saveSettings GraphQL mutation, all sections together).
  //   - If the user has NO atproto settings for a section → leave rockbox's
  //     value alone (don't reset it to anything).
  //   - If the user has NO atproto record at all → don't call rockbox at all.
  //
  // This way a fresh container boots with firmware defaults, then the moment
  // the user's atproto record loads we sync whatever sections they've saved
  // before. Sections they've never touched stay at firmware defaults.
  useEffect(() => {
    if (!did || !rockboxQ.data) return;
    // lexiconQ.data is `null` for users with no atproto record yet — skip
    // hydration entirely. lexiconQ.data is `undefined` while still loading.
    if (lexiconQ.data === undefined) return;
    if (hydratedDids.has(did)) return;
    if (lexiconQ.data === null) {
      hydratedDids.add(did);
      return;
    }
    // Mark BEFORE the async work so concurrent hook mounts on the same did
    // don't all race to push the same hydration patch.
    hydratedDids.add(did);

    const lex = lexiconQ.data;
    const cur = rockboxQ.data;
    const patch: SettingsPatch = {};

    // Each `add` helper only writes to the patch when the lexicon value is
    // genuinely DIFFERENT from rockbox's current value. Pushing identical
    // values still triggers rockbox to re-apply settings — for EQ bands that
    // means recomputing IIR coefficients, which can briefly drop audio. So
    // we only push diffs.
    const addIfChanged = <K extends keyof SettingsPatch>(
      key: K,
      lexValue: SettingsPatch[K] | undefined,
      curValue: SettingsPatch[K],
    ) => {
      if (lexValue === undefined) return;
      if (JSON.stringify(lexValue) === JSON.stringify(curValue)) return;
      patch[key] = lexValue;
    };

    // ── Equalizer ──
    if (lex.equalizer) {
      addIfChanged("eqEnabled", lex.equalizer.enabled, cur.eqEnabled);
      addIfChanged(
        "eqBandSettings",
        lex.equalizer.bands?.map(bandLexToRockbox),
        cur.eqBandSettings,
      );
      // eqPrecut isn't in the GET response so we can't diff — only push it
      // if the lexicon has a non-zero value (zero == firmware default, no-op).
      if (lex.equalizer.precut !== undefined && lex.equalizer.precut !== 0)
        patch.eqPrecut = lex.equalizer.precut;
    }

    // ── Tone ──
    if (lex.tone) {
      addIfChanged("bass", lex.tone.bass, cur.bass);
      addIfChanged("treble", lex.tone.treble, cur.treble);
      addIfChanged("balance", lex.tone.balance, cur.balance);
      if (lex.tone.channels) {
        const next = CHANNELS_TO_INT[lex.tone.channels];
        if (next !== cur.channelConfig) patch.channelConfig = next;
      }
    }

    // ── Crossfade ── (lexicon ms ↔ rockbox seconds)
    if (lex.crossfade) {
      if (lex.crossfade.mode) {
        const next = CROSSFADE_MODE_TO_INT[lex.crossfade.mode];
        if (next !== cur.crossfade) patch.crossfade = next;
      }
      const cfMap: [keyof typeof lex.crossfade, keyof SettingsPatch, number][] = [
        ["fadeInDelay", "fadeInDelay", cur.crossfadeFadeInDelay],
        ["fadeInDuration", "fadeInDuration", cur.crossfadeFadeInDuration],
        ["fadeOutDelay", "fadeOutDelay", cur.crossfadeFadeOutDelay],
        ["fadeOutDuration", "fadeOutDuration", cur.crossfadeFadeOutDuration],
      ];
      for (const [lexKey, patchKey, curSec] of cfMap) {
        const ms = lex.crossfade[lexKey];
        if (typeof ms !== "number") continue;
        const next = Math.round(ms / 1000);
        if (next !== curSec) (patch as Record<string, number>)[patchKey] = next;
      }
      if (lex.crossfade.fadeOutMixMode) {
        const next = FADE_MIX_TO_INT[lex.crossfade.fadeOutMixMode];
        if (next !== cur.crossfadeFadeOutMixmode) patch.fadeOutMixmode = next;
      }
    }

    // ── Replay Gain ── (single struct in rockbox — diff the whole thing)
    if (lex.replayGain) {
      const curRg = cur.replaygainSettings;
      const next = {
        type: lex.replayGain.mode
          ? REPLAYGAIN_TO_INT[lex.replayGain.mode]
          : curRg.type,
        preamp: lex.replayGain.preamp ?? curRg.preamp,
        noclip: lex.replayGain.preventClipping ?? curRg.noclip,
      };
      if (JSON.stringify(next) !== JSON.stringify(curRg))
        patch.replaygainSettings = next;
    }

    if (Object.keys(patch).length === 0) return;

    saveSettings(did, patch)
      .then(() => {
        const merged = applyLexiconToRockbox(cur, lex);
        qc.setQueryData([...QK_ROCKBOX, did], merged);
      })
      .catch((err) => {
        // If the push fails we want a retry on the next mount, not silent
        // permanent skip. Forget the dedup mark.
        hydratedDids.delete(did);
        console.warn("[useAudioSettings] hydrate to rockbox failed", err);
      });
  }, [did, rockboxQ.data, lexiconQ.data, qc]);

  const actions: AudioSettingsActions = {
    setEqualizer(patch) {
      if (!did) return;
      const cur = rockboxQ.data;
      if (!cur) return;
      const nextBands = patch.bands ?? cur.eqBandSettings;
      const lexicon: LexEqualizer = {};
      const rockbox: SettingsPatch = {};
      if (patch.enabled !== undefined) {
        rockbox.eqEnabled = patch.enabled;
        // Always include band settings alongside enable so a fresh container
        // gets the right preset cutoffs (matches the reference webui logic).
        rockbox.eqBandSettings = nextBands;
        lexicon.enabled = patch.enabled;
        lexicon.bands = nextBands.map(bandRockboxToLex);
      }
      if (patch.bands !== undefined) {
        rockbox.eqBandSettings = patch.bands;
        lexicon.bands = patch.bands.map(bandRockboxToLex);
      }
      if (patch.precut !== undefined) {
        rockbox.eqPrecut = patch.precut;
        lexicon.precut = patch.precut;
      }
      enqueue(did, qc, "equalizer", rockbox, lexicon);
    },

    setTone(patch) {
      if (!did) return;
      const rockbox: SettingsPatch = {};
      const lex: LexTone = {};
      if (patch.bass !== undefined) {
        rockbox.bass = patch.bass;
        lex.bass = patch.bass;
      }
      if (patch.treble !== undefined) {
        rockbox.treble = patch.treble;
        lex.treble = patch.treble;
      }
      if (patch.balance !== undefined) {
        rockbox.balance = patch.balance;
        lex.balance = patch.balance;
      }
      if (patch.channels !== undefined) {
        rockbox.channelConfig = CHANNELS_TO_INT[patch.channels];
        lex.channels = patch.channels;
      }
      enqueue(did, qc, "tone", rockbox, lex);
    },

    setCrossfade(patch) {
      if (!did) return;
      const rockbox: SettingsPatch = {};
      const lex: LexCrossfade = {};
      if (patch.mode !== undefined) {
        rockbox.crossfade = CROSSFADE_MODE_TO_INT[patch.mode];
        lex.mode = patch.mode;
      }
      if (patch.fadeInDelay !== undefined) {
        rockbox.fadeInDelay = Math.round(patch.fadeInDelay / 1000); // ms → s for rockbox
        lex.fadeInDelay = patch.fadeInDelay;
      }
      if (patch.fadeInDuration !== undefined) {
        rockbox.fadeInDuration = Math.round(patch.fadeInDuration / 1000);
        lex.fadeInDuration = patch.fadeInDuration;
      }
      if (patch.fadeOutDelay !== undefined) {
        rockbox.fadeOutDelay = Math.round(patch.fadeOutDelay / 1000);
        lex.fadeOutDelay = patch.fadeOutDelay;
      }
      if (patch.fadeOutDuration !== undefined) {
        rockbox.fadeOutDuration = Math.round(patch.fadeOutDuration / 1000);
        lex.fadeOutDuration = patch.fadeOutDuration;
      }
      if (patch.fadeOutMixMode !== undefined) {
        rockbox.fadeOutMixmode = FADE_MIX_TO_INT[patch.fadeOutMixMode];
        lex.fadeOutMixMode = patch.fadeOutMixMode;
      }
      enqueue(did, qc, "crossfade", rockbox, lex);
    },

    setReplayGain(patch) {
      if (!did) return;
      const cur = rockboxQ.data?.replaygainSettings ?? { noclip: false, type: 0, preamp: 0 };
      const next = {
        noclip: patch.preventClipping ?? cur.noclip,
        type: patch.mode !== undefined ? REPLAYGAIN_TO_INT[patch.mode] : cur.type,
        preamp: patch.preamp ?? cur.preamp,
      };
      const lex: LexReplayGain = {};
      if (patch.mode !== undefined) lex.mode = patch.mode;
      if (patch.preamp !== undefined) lex.preamp = patch.preamp;
      if (patch.preventClipping !== undefined) lex.preventClipping = patch.preventClipping;
      enqueue(did, qc, "replayGain", { replaygainSettings: next }, lex);
    },
  };

  return {
    data: rockboxQ.data,
    isLoading: rockboxQ.isLoading,
    isError: rockboxQ.isError,
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
