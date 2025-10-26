/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../lexicons";
import { isObj, hasProp } from "../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyArtistDefs from "./artist/defs";

export interface Record {
  /** The title of the song. */
  title: string;
  /** The artist of the song. */
  artist: string;
  /** The artists of the song with MusicBrainz IDs. */
  artists?: AppRockskyArtistDefs.ArtistMbid[];
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
  tags?: string[];
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
  /** The Tidal ID of the song. */
  tidalId?: string;
  /** The Spotify ID of the song. */
  spotifyId?: string;
  /** The Apple Music ID of the song. */
  appleMusicId?: string;
  /** The ISRC of the song. */
  isrc?: string;
  /** The date when the song was created. */
  createdAt: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The label of the song. */
  label?: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.scrobble#main" ||
      v.$type === "app.rocksky.scrobble")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.scrobble#main", v);
}
