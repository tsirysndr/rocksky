/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";

export interface Record {
  /** The title of the album. */
  title: string;
  /** The artist of the album. */
  artist: string;
  /** The duration of the album in seconds. */
  duration?: number;
  /** The release date of the album. */
  releaseDate?: string;
  /** The year the album was released. */
  year?: number;
  /** The genre of the album. */
  genre?: string;
  /** The album art of the album. */
  albumArt?: BlobRef;
  /** The URL of the album art of the album. */
  albumArtUrl?: string;
  /** The tags of the album. */
  tags?: string[];
  /** The YouTube link of the album. */
  youtubeLink?: string;
  /** The Spotify link of the album. */
  spotifyLink?: string;
  /** The tidal link of the album. */
  tidalLink?: string;
  /** The Apple Music link of the album. */
  appleMusicLink?: string;
  /** The Tidal ID of the album. */
  tidalId?: string;
  /** The Spotify ID of the album. */
  spotifyId?: string;
  /** The Apple Music ID of the album. */
  appleMusicId?: string;
  /** The date and time when the album was created. */
  createdAt: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.album#main" || v.$type === "app.rocksky.album")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.album#main", v);
}
