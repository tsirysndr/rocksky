/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { BlobRef } from "@atp/lexicon";
import { validate as _validate } from "../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.album";

export interface Record {
  $type: "app.rocksky.album";
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
  tags?: (string)[];
  /** The YouTube link of the album. */
  youtubeLink?: string;
  /** The Spotify link of the album. */
  spotifyLink?: string;
  /** The tidal link of the album. */
  tidalLink?: string;
  /** The Apple Music link of the album. */
  appleMusicLink?: string;
  /** The date and time when the album was created. */
  createdAt: string;
  [k: string]: unknown;
}

const hashRecord = "main";

export function isRecord<V>(v: V) {
  return is$typed(v, id, hashRecord);
}

export function validateRecord<V>(v: V) {
  return validate<Record & V>(v, id, hashRecord, true);
}

export type Main = Record;
