/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { BlobRef } from "@atp/lexicon";
import { validate as _validate } from "../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../util.ts";
import type * as AppRockskyArtistDefs from "./artist/defs.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.song";

export interface Record {
  $type: "app.rocksky.song";
  /** The title of the song. */
  title: string;
  /** The artist of the song. */
  artist: string;
  /** The artists of the song with MusicBrainz IDs. */
  artists?: (AppRockskyArtistDefs.ArtistMbid)[];
  /** The album artist of the song. */
  albumArtist: string;
  /** The album of the song. */
  album: string;
  /** The duration of the song in seconds. */
  duration: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The release date of the song. */
  releaseDate?: string;
  /** The year the song was released. */
  year?: number;
  /** The genre of the song. */
  genre?: string;
  /** The tags of the song. */
  tags?: (string)[];
  /** The composer of the song. */
  composer?: string;
  /** The lyrics of the song. */
  lyrics?: string;
  /** The copyright message of the song. */
  copyrightMessage?: string;
  /** Informations about the song */
  wiki?: string;
  /** The album art of the song. */
  albumArt?: BlobRef;
  /** The URL of the album art of the song. */
  albumArtUrl?: string;
  /** The YouTube link of the song. */
  youtubeLink?: string;
  /** The Spotify link of the song. */
  spotifyLink?: string;
  /** The Tidal link of the song. */
  tidalLink?: string;
  /** The Apple Music link of the song. */
  appleMusicLink?: string;
  /** The date when the song was created. */
  createdAt: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The label of the song. */
  label?: string;
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
