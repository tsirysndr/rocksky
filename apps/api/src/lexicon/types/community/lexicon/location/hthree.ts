/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

/** A physical location in the form of a H3 encoded location. */
export interface Main {
  /** The h3 encoded location. */
  value: string;
  /** The name of the location. */
  name?: string;
  [k: string]: unknown;
}

export function isMain(v: unknown): v is Main {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.location.hthree#main" ||
      v.$type === "community.lexicon.location.hthree")
  );
}

export function validateMain(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.location.hthree#main", v);
}
