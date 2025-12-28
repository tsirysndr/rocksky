/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyScrobbleDefs from "./defs.ts";

export type QueryParams = globalThis.Record<PropertyKey, never>;

export interface InputSchema {
  /** The title of the track being scrobbled */
  title: string;
  /** The artist of the track being scrobbled */
  artist: string;
  /** The album of the track being scrobbled */
  album?: string;
  /** The duration of the track in seconds */
  duration?: number;
  /** The MusicBrainz ID of the track, if available */
  mbId?: string;
  /** The URL of the album art for the track */
  albumArt?: string;
  /** The track number of the track in the album */
  trackNumber?: number;
  /** The release date of the track, formatted as YYYY-MM-DD */
  releaseDate?: string;
  /** The year the track was released */
  year?: number;
  /** The disc number of the track in the album, if applicable */
  discNumber?: number;
  /** The lyrics of the track, if available */
  lyrics?: string;
  /** The composer of the track, if available */
  composer?: string;
  /** The copyright message for the track, if available */
  copyrightMessage?: string;
  /** The record label of the track, if available */
  label?: string;
  /** The URL of the artist's picture, if available */
  artistPicture?: string;
  /** The Spotify link for the track, if available */
  spotifyLink?: string;
  /** The Last.fm link for the track, if available */
  lastfmLink?: string;
  /** The Tidal link for the track, if available */
  tidalLink?: string;
  /** The Apple Music link for the track, if available */
  appleMusicLink?: string;
  /** The Youtube link for the track, if available */
  youtubeLink?: string;
  /** The Deezer link for the track, if available */
  deezerLink?: string;
  /** The timestamp of the scrobble in milliseconds since epoch */
  timestamp?: number;
}

export type OutputSchema = AppRockskyScrobbleDefs.ScrobbleViewBasic;

export interface HandlerInput {
  encoding: "application/json";
  body: InputSchema;
}

export interface HandlerSuccess {
  encoding: "application/json";
  body: OutputSchema;
  headers?: { [key: string]: string };
}

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | HandlerSuccess;
