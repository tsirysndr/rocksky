/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

/** A physical location contained in the Foursquare Open Source Places dataset. */
export interface Main {
  /** The unique identifier of a Foursquare POI. */
  fsq_place_id: string;
  latitude?: string;
  longitude?: string;
  /** The name of the location. */
  name?: string;
  [k: string]: unknown;
}

export function isMain(v: unknown): v is Main {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.location.fsq#main" ||
      v.$type === "community.lexicon.location.fsq")
  );
}

export function validateMain(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.location.fsq#main", v);
}
