/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

/** A physical location in the form of a street address. */
export interface Main {
  /** The ISO 3166 country code. Preferably the 2-letter code. */
  country: string;
  /** The postal code of the location. */
  postalCode?: string;
  /** The administrative region of the country. For example, a state in the USA. */
  region?: string;
  /** The locality of the region. For example, a city in the USA. */
  locality?: string;
  /** The street address. */
  street?: string;
  /** The name of the location. */
  name?: string;
  [k: string]: unknown;
}

export function isMain(v: unknown): v is Main {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.location.address#main" ||
      v.$type === "community.lexicon.location.address")
  );
}

export function validateMain(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.location.address#main", v);
}
