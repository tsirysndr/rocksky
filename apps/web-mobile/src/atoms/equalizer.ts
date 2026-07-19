import { atomWithStorage } from "jotai/utils";

export interface EqBandSetting {
  cutoff: number;
  gain: number; // dB, clamped to [-24, +24]
}

// The 10 EQ band centre frequencies (32 Hz … 16 kHz). Shared canonical set —
// index-aligned with the EQ UI and the wasm engine. Matches atradio.fm.
export const EQ_BANDS_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

// 10-band EQ: band 0 = low-shelf, bands 1-8 = peaking, band 9 = high-shelf
export const EQ_BANDS: EqBandSetting[] = EQ_BANDS_HZ.map((cutoff) => ({
  cutoff,
  gain: 0,
}));

// Q=7.0 matches the Rockbox firmware default.
export const EQ_Q = 7.0;

// getOnInit reads localStorage synchronously so the first render already has
// the stored EQ, not the flat default — otherwise the engine gets a flat EQ
// pushed for one render on app load (audible flicker).
const SYNC_INIT = { getOnInit: true } as const;

export const eqEnabledAtom = atomWithStorage<boolean>(
  "eq_enabled",
  false,
  undefined,
  SYNC_INIT,
);
export const eqBandsAtom = atomWithStorage<EqBandSetting[]>(
  "eq_bands",
  EQ_BANDS,
  undefined,
  SYNC_INIT,
);

// ── Crossfade (rockbox pcmbuf algorithm, run in the wasm engine) ─────────────
export const crossfadeEnabledAtom = atomWithStorage<boolean>(
  "crossfade_enabled",
  false,
  undefined,
  SYNC_INIT,
);
// Fade in/out duration in seconds (Rockbox range 0–15 s).
export const crossfadeDurationAtom = atomWithStorage<number>(
  "crossfade_duration",
  2,
  undefined,
  SYNC_INIT,
);
