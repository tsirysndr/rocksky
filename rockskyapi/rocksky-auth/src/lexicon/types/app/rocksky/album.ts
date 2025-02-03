/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'
import * as AppRockskySong from './song'

export interface Record {
  /** The title of the album. */
  title: string
  /** The artist of the album. */
  artist: string
  /** The duration of the album in seconds. */
  duration?: number
  /** The release date of the album. */
  releaseDate?: string
  /** The year the album was released. */
  year?: number
  /** The genre of the album. */
  genre?: string
  /** The album art of the album. */
  albumArt?: BlobRef
  /** The tags of the album. */
  tags?: string[]
  /** The tracks in the album. */
  tracks?: AppRockskySong.Record[]
  /** The YouTube link of the album. */
  youtubeLink?: string
  /** The Spotify link of the album. */
  spotifyLink?: string
  /** The Tidal link of the album. */
  tidalLink?: string
  /** The Apple Music link of the album. */
  appleMusicLink?: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.album#main' || v.$type === 'app.rocksky.album')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.album#main', v)
}
