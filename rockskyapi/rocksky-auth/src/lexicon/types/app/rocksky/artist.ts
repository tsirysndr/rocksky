/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'

export interface Record {
  /** The name of the artist. */
  name: string
  /** The biography of the artist. */
  bio: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.artist#main' || v.$type === 'app.rocksky.artist')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.artist#main', v)
}
