/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as ComAtprotoRepoStrongRef from "../../../com/atproto/repo/strongRef";

export interface Record {
  createdAt: string;
  subject: string;
  via?: ComAtprotoRepoStrongRef.Main;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.graph.follow#main" ||
      v.$type === "app.rocksky.graph.follow")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.graph.follow#main", v);
}
