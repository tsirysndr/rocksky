/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";

export interface Record {
  /** The name of the artist. */
  name: string;
  /** The biography of the artist. */
  bio?: string;
  /** The picture of the artist. */
  picture?: BlobRef;
  /** The URL of the picture of the artist. */
  pictureUrl?: string;
  /** The tags of the artist. */
  tags?: string[];
  /** The Tidal ID of the artist. */
  tidalId?: string;
  /** The Spotify ID of the artist. */
  spotifyId?: string;
  /** The Apple Music ID of the artist. */
  appleMusicId?: string;
  /** The roles of the artist. */
  roles?: string[];
  /** The birth date of the artist. */
  born?: string;
  /** The death date of the artist. */
  died?: string;
  /** The birth place of the artist. */
  bornIn?: string;
  /** The date when the artist was created. */
  createdAt: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.artist#main" || v.$type === "app.rocksky.artist")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.artist#main", v);
}
