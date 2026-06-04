/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface RadioViewBasic {
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The date and time when the radio was created. */
  createdAt?: string;
  [k: string]: unknown;
}

export function isRadioViewBasic(v: unknown): v is RadioViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.radio.defs#radioViewBasic"
  );
}

export function validateRadioViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.radio.defs#radioViewBasic", v);
}

export interface RadioViewDetailed {
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The website of the radio. */
  website?: string;
  /** The streaming URL of the radio. */
  url?: string;
  /** The genre of the radio. */
  genre?: string;
  /** The logo of the radio station. */
  logo?: string;
  /** The date and time when the radio was created. */
  createdAt?: string;
  [k: string]: unknown;
}

export function isRadioViewDetailed(v: unknown): v is RadioViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.radio.defs#radioViewDetailed"
  );
}

export function validateRadioViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.radio.defs#radioViewDetailed", v);
}
