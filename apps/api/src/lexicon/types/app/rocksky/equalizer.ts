/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyRockboxDefs from "./rockbox/defs";

export interface Record {
  /** Display name of the preset. */
  name: string;
  /** Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60 = -6.0 dB) */
  precut?: number;
  /** Up to 10 EQ bands */
  bands: AppRockskyRockboxDefs.EqualizerBand[];
  /** When this preset was first created. */
  createdAt: string;
  /** When this preset was last updated. */
  updatedAt?: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.equalizer#main" ||
      v.$type === "app.rocksky.equalizer")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.equalizer#main", v);
}
