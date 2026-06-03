/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
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
