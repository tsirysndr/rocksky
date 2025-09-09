/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface ApiKeyView {
  /** The unique identifier of the API key. */
  id?: string;
  /** The name of the API key. */
  name?: string;
  /** A description for the API key. */
  description?: string;
  /** The date and time when the API key was created. */
  createdAt?: string;
  [k: string]: unknown;
}

export function isApiKeyView(v: unknown): v is ApiKeyView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.apikey.defs#apiKeyView"
  );
}

export function validateApiKeyView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.apikey.defs#apiKeyView", v);
}
