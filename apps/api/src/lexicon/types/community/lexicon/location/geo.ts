/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

/** A physical location in the form of a WGS84 coordinate. */
export interface Main {
  latitude: string;
  longitude: string;
  altitude?: string;
  /** The name of the location. */
  name?: string;
  [k: string]: unknown;
}

export function isMain(v: unknown): v is Main {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.location.geo#main" ||
      v.$type === "community.lexicon.location.geo")
  );
}

export function validateMain(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.location.geo#main", v);
}
