/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'

export interface Record {
  /** The title of the song. */
  title: string
  /** The artist of the song. */
  artist: string
  /** The artist of the album the song is from. */
  artistAlbum?: string
  /** The album the song is from. */
  album: string
  /** The duration of the song in seconds. */
  duration: number
  /** The release date of the song. */
  releaseDate?: string
  /** The year the song was released. */
  year?: number
  /** The genre of the song. */
  genre?: string
  /** The tags of the song. */
  tags?: string[]
  /** The composer of the song. */
  composer?: string
  /** The lyrics of the song. */
  lyrics?: string
  /** Informations about the song */
  wiki?: string
  /** The album art of the song. */
  albumArt?: BlobRef
  /** The YouTube link of the song. */
  youtubeLink?: string
  /** The Spotify link of the song. */
  spotifyLink?: string
  /** The Tidal link of the song. */
  tidalLink?: string
  /** The Apple Music link of the song. */
  appleMusicLink?: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.song#main' || v.$type === 'app.rocksky.song')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.song#main', v)
}
