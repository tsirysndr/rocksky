/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface ShoutView {
  /** The unique identifier of the shout. */
  id?: string
  /** The content of the shout. */
  message?: string
  /** The ID of the parent shout if this is a reply, otherwise null. */
  parent?: string
  /** The date and time when the shout was created. */
  createdAt?: string
  /** The DID of the author of the shout. */
  authorDid?: string
  [k: string]: unknown
}

export function isShoutView(v: unknown): v is ShoutView {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.shout.defs#shoutView'
  )
}

export function validateShoutView(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.shout.defs#shoutView', v)
}
