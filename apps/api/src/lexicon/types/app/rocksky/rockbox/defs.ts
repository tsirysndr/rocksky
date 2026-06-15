/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface CrossfadeSettings {
  /** Crossfade mode: disabled | enabled | shuffle | albumChange | trackChange */
  mode?: string;
  /** Fade-in delay in ms */
  fadeInDelay?: number;
  /** Fade-in duration in ms */
  fadeInDuration?: number;
  /** Fade-out delay in ms */
  fadeOutDelay?: number;
  /** Fade-out duration in ms */
  fadeOutDuration?: number;
  /** Fade-out mix mode: crossfade | mix */
  fadeOutMixMode?: string;
  [k: string]: unknown;
}

export function isCrossfadeSettings(v: unknown): v is CrossfadeSettings {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#crossfadeSettings"
  );
}

export function validateCrossfadeSettings(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#crossfadeSettings", v);
}

export interface EqualizerBand {
  /** Center frequency in Hz */
  frequency: number;
  /** Band gain in dB */
  gain: number;
  /** Q factor × 10 (e.g. 7 = Q 0.7) */
  q: number;
  [k: string]: unknown;
}

export function isEqualizerBand(v: unknown): v is EqualizerBand {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#equalizerBand"
  );
}

export function validateEqualizerBand(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#equalizerBand", v);
}

export interface EqualizerSettings {
  /** Whether the equalizer is enabled */
  enabled?: boolean;
  /** Pre-amplification cut in dB applied before EQ bands */
  precut?: number;
  /** Up to 10 EQ bands */
  bands?: EqualizerBand[];
  [k: string]: unknown;
}

export function isEqualizerSettings(v: unknown): v is EqualizerSettings {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#equalizerSettings"
  );
}

export function validateEqualizerSettings(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#equalizerSettings", v);
}

export interface ReplayGainSettings {
  /** Replay gain mode: disabled | track | album | trackIfShuffling */
  mode?: string;
  /** Pre-amplification in tenths of dB (e.g. 15 = +1.5 dB) */
  preamp?: number;
  /** Whether to prevent clipping by reducing volume */
  preventClipping?: boolean;
  [k: string]: unknown;
}

export function isReplayGainSettings(v: unknown): v is ReplayGainSettings {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#replayGainSettings"
  );
}

export function validateReplayGainSettings(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#replayGainSettings", v);
}

export interface ToneSettings {
  /** Bass level in dB */
  bass?: number;
  /** Treble level in dB */
  treble?: number;
  /** Left/right balance. Negative = left, positive = right */
  balance?: number;
  /** Channel configuration: stereo | mono | monoLeft | monoRight | karaoke | wide */
  channels?: string;
  [k: string]: unknown;
}

export function isToneSettings(v: unknown): v is ToneSettings {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#toneSettings"
  );
}

export function validateToneSettings(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#toneSettings", v);
}

export interface SettingsView {
  crossfade?: CrossfadeSettings;
  equalizer?: EqualizerSettings;
  replayGain?: ReplayGainSettings;
  tone?: ToneSettings;
  /** When this settings record was first created. */
  createdAt: string;
  /** When this settings record was last updated. */
  updatedAt?: string;
  [k: string]: unknown;
}

export function isSettingsView(v: unknown): v is SettingsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.rockbox.defs#settingsView"
  );
}

export function validateSettingsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.defs#settingsView", v);
}
