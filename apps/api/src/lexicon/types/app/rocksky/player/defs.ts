/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface CurrentlyPlayingViewDetailed {
  /** The title of the currently playing track */
  title?: string
  [k: string]: unknown
}

export function isCurrentlyPlayingViewDetailed(
  v: unknown,
): v is CurrentlyPlayingViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.player.defs#currentlyPlayingViewDetailed'
  )
}

export function validateCurrentlyPlayingViewDetailed(
  v: unknown,
): ValidationResult {
  return lexicons.validate(
    'app.rocksky.player.defs#currentlyPlayingViewDetailed',
    v,
  )
}
