/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'
import type * as ComAtprotoRepoStrongRef from '../../com/atproto/repo/strongRef'

export interface Record {
  /** The date when the like was created. */
  createdAt: string
  subject: ComAtprotoRepoStrongRef.Main
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'app.rocksky.like#main' || v.$type === 'app.rocksky.like')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.like#main', v)
}
