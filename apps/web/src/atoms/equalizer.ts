import { atomWithStorage } from "jotai/utils";

export interface EqBandSetting {
  cutoff: number;
  gain: number; // dB, clamped to [-24, +24]
}

// The 10 EQ band centre frequencies (32 Hz … 16 kHz). Shared canonical set —
// index-aligned across the EQ UI, the settings lexicon and the wasm engine.
// Matches atradio.fm so records sync cleanly.
export const EQ_BANDS_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

// 10-band EQ: band 0 = low-shelf, bands 1-8 = peaking, band 9 = high-shelf
export const EQ_BANDS: EqBandSetting[] = EQ_BANDS_HZ.map((cutoff) => ({
  cutoff,
  gain: 0,
}));

// Q=7.0 matches the Rockbox firmware default (stored as tenths: 70 → 7.0).
export const EQ_Q = 7.0;

export const eqEnabledAtom = atomWithStorage<boolean>("eq_enabled", false);
export const eqBandsAtom = atomWithStorage<EqBandSetting[]>("eq_bands", EQ_BANDS);
