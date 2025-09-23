/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface ArtistViewBasic {
  /** The unique identifier of the artist. */
  id?: string
  /** The URI of the artist. */
  uri?: string
  /** The name of the artist. */
  name?: string
  /** The picture of the artist. */
  picture?: string
  /** The SHA256 hash of the artist. */
  sha256?: string
  /** The number of times the artist has been played. */
  playCount?: number
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number
  [k: string]: unknown
}

export function isArtistViewBasic(v: unknown): v is ArtistViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.artist.defs#artistViewBasic'
  )
}

export function validateArtistViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.artist.defs#artistViewBasic', v)
}

export interface ArtistViewDetailed {
  /** The unique identifier of the artist. */
  id?: string
  /** The URI of the artist. */
  uri?: string
  /** The name of the artist. */
  name?: string
  /** The picture of the artist. */
  picture?: string
  /** The SHA256 hash of the artist. */
  sha256?: string
  /** The number of times the artist has been played. */
  playCount?: number
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number
  [k: string]: unknown
}

export function isArtistViewDetailed(v: unknown): v is ArtistViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.artist.defs#artistViewDetailed'
  )
}

export function validateArtistViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.artist.defs#artistViewDetailed', v)
}
