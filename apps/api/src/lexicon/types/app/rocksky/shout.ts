/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";
import type * as ComAtprotoRepoStrongRef from "../../com/atproto/repo/strongRef";

export interface Record {
  /** The message of the shout. */
  message: string;
  /** The date when the shout was created. */
  createdAt: string;
  parent?: ComAtprotoRepoStrongRef.Main;
  subject: ComAtprotoRepoStrongRef.Main;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.shout#main" || v.$type === "app.rocksky.shout")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.shout#main", v);
}
