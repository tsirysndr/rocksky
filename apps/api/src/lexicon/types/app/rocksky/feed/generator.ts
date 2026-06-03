/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { BlobRef, ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";

export interface Record {
  did: string;
  avatar?: BlobRef;
  displayName: string;
  description?: string;
  createdAt: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.feed.generator#main" ||
      v.$type === "app.rocksky.feed.generator")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.generator#main", v);
}
