/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
import type * as AppRockskyActorDefs from "./defs";

export interface Record {
  track: AppRockskyActorDefs.TrackView;
  /** When the track started playing. */
  startedAt: string;
  /** When the status expires. Defaults to startedAt plus track duration plus idle time. */
  expiresAt?: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.actor.status#main" ||
      v.$type === "app.rocksky.actor.status")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.status#main", v);
}
