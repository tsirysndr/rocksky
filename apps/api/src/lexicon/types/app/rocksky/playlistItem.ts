/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'
import type * as ComAtprotoRepoStrongRef from '../../com/atproto/repo/strongRef'
import type * as AppRockskySongDefs from './song/defs'

export interface Record {
  subject: ComAtprotoRepoStrongRef.Main
  /** The date the playlist was created. */
  createdAt: string
  track: AppRockskySongDefs.SongViewBasic
  /** The order of the item in the playlist. */
  order: number
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.playlistItem#main' ||
      v.$type === 'app.rocksky.playlistItem')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.playlistItem#main', v)
}
