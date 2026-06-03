/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { BlobRef, ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../lexicons";
import { hasProp, isObj } from "../../../util";

export interface Record {
  /** The name of the playlist. */
  name: string;
  /** The playlist description. */
  description?: string;
  /** The picture of the playlist. */
  picture?: BlobRef;
  /** The URL of the picture of the artist. */
  pictureUrl?: string;
  /** The date the playlist was created. */
  createdAt: string;
  /** The Spotify link of the playlist. */
  spotifyLink?: string;
  /** The Tidal link of the playlist. */
  tidalLink?: string;
  /** The YouTube link of the playlist. */
  youtubeLink?: string;
  /** The Apple Music link of the playlist. */
  appleMusicLink?: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.playlist#main" ||
      v.$type === "app.rocksky.playlist")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.playlist#main", v);
}
