/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import type * as AppRockskySongDefsSongViewBasic from '../song/defs/songViewBasic'

export interface AlbumViewBasic {
  /** The unique identifier of the album. */
  id?: string
  /** The URI of the album. */
  uri?: string
  /** The title of the album. */
  title?: string
  /** The artist of the album. */
  artist?: string
  /** The URI of the album's artist. */
  artistUri?: string
  /** The year the album was released. */
  year?: number
  /** The URL of the album art image. */
  albumArt?: string
  /** The release date of the album. */
  releaseDate?: string
  /** The SHA256 hash of the album. */
  sha256?: string
  /** The number of times the album has been played. */
  playCount?: number
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number
  [k: string]: unknown
}

export function isAlbumViewBasic(v: unknown): v is AlbumViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.album.defs#albumViewBasic'
  )
}

export function validateAlbumViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.album.defs#albumViewBasic', v)
}

export interface AlbumViewDetailed {
  /** The unique identifier of the album. */
  id?: string
  /** The URI of the album. */
  uri?: string
  /** The title of the album. */
  title?: string
  /** The artist of the album. */
  artist?: string
  /** The URI of the album's artist. */
  artistUri?: string
  /** The year the album was released. */
  year?: number
  /** The URL of the album art image. */
  albumArt?: string
  /** The release date of the album. */
  releaseDate?: string
  /** The SHA256 hash of the album. */
  sha256?: string
  /** The number of times the album has been played. */
  playCount?: number
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number
  tracks?: AppRockskySongDefsSongViewBasic.Main[]
  [k: string]: unknown
}

export function isAlbumViewDetailed(v: unknown): v is AlbumViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.album.defs#albumViewDetailed'
  )
}

export function validateAlbumViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.album.defs#albumViewDetailed', v)
}
