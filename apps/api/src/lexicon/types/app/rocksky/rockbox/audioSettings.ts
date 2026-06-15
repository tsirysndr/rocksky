/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyRockboxDefs from "./defs";

export interface Record {
  crossfade?: AppRockskyRockboxDefs.CrossfadeSettings;
  equalizer?: AppRockskyRockboxDefs.EqualizerSettings;
  replayGain?: AppRockskyRockboxDefs.ReplayGainSettings;
  tone?: AppRockskyRockboxDefs.ToneSettings;
  /** When this settings record was first created. */
  createdAt: string;
  /** When this settings record was last updated. */
  updatedAt?: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.rockbox.audioSettings#main" ||
      v.$type === "app.rocksky.rockbox.audioSettings")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.rockbox.audioSettings#main", v);
}
