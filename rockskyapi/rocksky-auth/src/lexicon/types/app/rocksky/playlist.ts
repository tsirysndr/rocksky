/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'
import * as AppRockskySong from './song'

export interface Record {
  /** The name of the playlist. */
  name: string
  /** The playlist description. */
  description?: string
  /** The picture of the playlist. */
  picture?: BlobRef
  /** The tracks in the playlist. */
  tracks?: AppRockskySong.Record[]
  /** The date the playlist was created. */
  createdAt: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.playlist#main' ||
      v.$type === 'app.rocksky.playlist')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.playlist#main', v)
}
