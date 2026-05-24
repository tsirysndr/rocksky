import { atomWithStorage } from "jotai/utils";

export interface EqBandSetting {
  cutoff: number;
  gain: number; // dB, clamped to [-24, +24]
}

// 10-band EQ: band 0 = low-shelf, bands 1-8 = peaking, band 9 = high-shelf
export const EQ_BANDS: EqBandSetting[] = [
  { cutoff: 60,    gain: 0 },
  { cutoff: 200,   gain: 0 },
  { cutoff: 500,   gain: 0 },
  { cutoff: 1000,  gain: 0 },
  { cutoff: 2000,  gain: 0 },
  { cutoff: 4000,  gain: 0 },
  { cutoff: 7000,  gain: 0 },
  { cutoff: 10000, gain: 0 },
  { cutoff: 14000, gain: 0 },
  { cutoff: 20000, gain: 0 },
];

// Q=7.0 matches the Rockbox firmware default (stored as tenths: 70 → 7.0).
export const EQ_Q = 7.0;

export const eqEnabledAtom = atomWithStorage<boolean>("eq_enabled", false);
export const eqBandsAtom = atomWithStorage<EqBandSetting[]>("eq_bands", EQ_BANDS);
