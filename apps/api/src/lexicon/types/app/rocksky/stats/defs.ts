/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface StatsView {
  /** The total number of scrobbles. */
  scrobbles?: number
  /** The total number of unique artists scrobbled. */
  artists?: number
  /** The total number of tracks marked as loved. */
  lovedTracks?: number
  /** The total number of unique albums scrobbled. */
  albums?: number
  /** The total number of unique tracks scrobbled. */
  tracks?: number
  [k: string]: unknown
}

export function isStatsView(v: unknown): v is StatsView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.stats.defs#statsView'
  )
}

export function validateStatsView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.stats.defs#statsView', v)
}
