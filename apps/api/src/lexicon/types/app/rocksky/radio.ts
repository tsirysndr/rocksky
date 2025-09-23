/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'

export interface Record {
  /** The name of the radio station. */
  name: string
  /** The URL of the radio station. */
  url: string
  /** A description of the radio station. */
  description?: string
  /** The genre of the radio station. */
  genre?: string
  /** The logo of the radio station. */
  logo?: BlobRef
  /** The website of the radio station. */
  website?: string
  /** The date when the radio station was created. */
  createdAt: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.radio#main' || v.$type === 'app.rocksky.radio')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.radio#main', v)
}
