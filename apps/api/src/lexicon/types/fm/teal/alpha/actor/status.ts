/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../../lexicons";
import { hasProp, isObj } from "../../../../../util";
import type * as FmTealAlphaFeedDefs from "../feed/defs";

export interface Record {
  /** The RFC 3339 formatted time of when the item was recorded */
  time: string;
  /** The RFC 3339 formatted time of the expiry time of the item. If unavailable, default to 10 minutes past the start time. */
  expiry?: string;
  item: FmTealAlphaFeedDefs.PlayView;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "fm.teal.alpha.actor.status#main" ||
      v.$type === "fm.teal.alpha.actor.status")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("fm.teal.alpha.actor.status#main", v);
}
