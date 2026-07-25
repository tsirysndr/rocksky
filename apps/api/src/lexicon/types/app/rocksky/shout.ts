/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";
import type * as ComAtprotoRepoStrongRef from "../../com/atproto/repo/strongRef";
import type * as AppRockskyShoutDefs from "./shout/defs";

export interface Record {
  /** The message of the shout. Optional when a gif/sticker/clip is attached. */
  message?: string;
  /** The date when the shout was created. */
  createdAt: string;
  parent?: ComAtprotoRepoStrongRef.Main;
  subject: ComAtprotoRepoStrongRef.Main;
  /** An attached GIF, sticker, or clip (e.g. from KLIPY). */
  gif?: AppRockskyShoutDefs.Gif;
  /** Mentions of other actors within the message, anchored to UTF-8 byte ranges. */
  facets?: AppRockskyShoutDefs.Mention[];
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
