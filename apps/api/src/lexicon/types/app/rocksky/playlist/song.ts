/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as ComAtprotoRepoStrongRef from "../../../com/atproto/repo/strongRef";

export interface Record {
  playlist: ComAtprotoRepoStrongRef.Main;
  song: ComAtprotoRepoStrongRef.Main;
  /** The title of the song. */
  title: string;
  /** The artist of the song. */
  artist: string;
  /** The album the song belongs to. */
  album: string;
  /** The album artist of the song. */
  albumArtist: string;
  /** The duration of the song in milliseconds. */
  duration: number;
  /** The URL of the album art of the song. */
  albumArtUrl?: string;
  /** The date and time the song was added to the playlist. */
  addedAt: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.playlist.song#main" ||
      v.$type === "app.rocksky.playlist.song")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.playlist.song#main", v);
}
