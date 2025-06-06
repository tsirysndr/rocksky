/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import * as AppRockskySongDefs from '../song/defs'

/** Detailed view of a playlist, including its tracks and metadata */
export interface PlaylistViewDetailed {
  /** The unique identifier of the playlist. */
  id?: string
  /** The title of the playlist. */
  title?: string
  /** The URI of the playlist. */
  uri?: string
  /** The DID of the curator of the playlist. */
  curatorDid?: string
  /** A description of the playlist. */
  description?: string
  /** The URL of the cover image for the playlist. */
  coverImageUrl?: string
  /** The date and time when the playlist was created. */
  createdAt?: string
  /** A list of tracks in the playlist. */
  tracks?: AppRockskySongDefs.SongViewBasic[]
  [k: string]: unknown
}

export function isPlaylistViewDetailed(v: unknown): v is PlaylistViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.playlist.defs#playlistViewDetailed'
  )
}

export function validatePlaylistViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.playlist.defs#playlistViewDetailed', v)
}

/** Basic view of a playlist, including its metadata */
export interface PlaylistViewBasic {
  /** The unique identifier of the playlist. */
  id?: string
  /** The title of the playlist. */
  title?: string
  /** The URI of the playlist. */
  uri?: string
  /** The DID of the curator of the playlist. */
  curatorDid?: string
  /** A description of the playlist. */
  description?: string
  /** The URL of the cover image for the playlist. */
  coverImageUrl?: string
  /** The date and time when the playlist was created. */
  createdAt?: string
  [k: string]: unknown
}

export function isPlaylistViewBasic(v: unknown): v is PlaylistViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.playlist.defs#playlistViewBasic'
  )
}

export function validatePlaylistViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.playlist.defs#playlistViewBasic', v)
}
