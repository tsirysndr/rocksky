/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface SongViewBasic {
  /** The unique identifier of the song. */
  id?: string
  /** The title of the song. */
  title?: string
  /** The artist of the song. */
  artist?: string
  /** The artist of the album the song belongs to. */
  album_artist?: string
  /** The URL of the album art image. */
  album_art?: string
  /** The URI of the song. */
  uri?: string
  /** The album of the song. */
  album?: string
  /** The duration of the song in milliseconds. */
  duration?: number
  /** The track number of the song in the album. */
  track_number?: number
  /** The disc number of the song in the album. */
  disc_number?: number
  /** The number of times the song has been played. */
  play_count?: number
  /** The number of unique listeners who have played the song. */
  unique_listeners?: number
  /** The URI of the album the song belongs to. */
  album_uri?: string
  /** The URI of the artist of the song. */
  artist_uri?: string
  /** The SHA256 hash of the song. */
  sha256?: string
  /** The timestamp when the song was created. */
  created_at?: string
  [k: string]: unknown
}

export function isSongViewBasic(v: unknown): v is SongViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.song.defs#songViewBasic'
  )
}

export function validateSongViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.song.defs#songViewBasic', v)
}

export interface SongViewDetailed {
  /** The unique identifier of the song. */
  id?: string
  /** The title of the song. */
  title?: string
  /** The artist of the song. */
  artist?: string
  /** The artist of the album the song belongs to. */
  album_artist?: string
  /** The URL of the album art image. */
  album_art?: string
  /** The URI of the song. */
  uri?: string
  /** The album of the song. */
  album?: string
  /** The duration of the song in milliseconds. */
  duration?: number
  /** The track number of the song in the album. */
  track_number?: number
  /** The disc number of the song in the album. */
  disc_number?: number
  /** The number of times the song has been played. */
  play_count?: number
  /** The number of unique listeners who have played the song. */
  unique_listeners?: number
  /** The URI of the album the song belongs to. */
  album_uri?: string
  /** The URI of the artist of the song. */
  artist_uri?: string
  /** The SHA256 hash of the song. */
  sha256?: string
  /** The timestamp when the song was created. */
  created_at?: string
  [k: string]: unknown
}

export function isSongViewDetailed(v: unknown): v is SongViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.song.defs#songViewDetailed'
  )
}

export function validateSongViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.song.defs#songViewDetailed', v)
}
