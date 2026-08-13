/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as FmTealFeedDefs from "../feed/defs";

export interface Record {
  /** The datetime at which the status was recorded. */
  time: string;
  /** The datetime after which the status is no longer current. If unavailable, default to 10 minutes after the start time. */
  expiry?: string;
  item: FmTealFeedDefs.PlayView;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "fm.teal.actor.status#main" ||
      v.$type === "fm.teal.actor.status")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("fm.teal.actor.status#main", v);
}
