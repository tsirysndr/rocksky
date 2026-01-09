/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

/** indicates that a handle or DID could not be resolved */
export interface NotFoundActor {
  actor: string
  notFound: boolean
  [k: string]: unknown
}

export function isNotFoundActor(v: unknown): v is NotFoundActor {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.graph.defs#notFoundActor'
  )
}

export function validateNotFoundActor(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.graph.defs#notFoundActor', v)
}

export interface Relationship {
  did: string
  /** if the actor follows this DID, this is the AT-URI of the follow record */
  following?: string
  /** if the actor is followed by this DID, contains the AT-URI of the follow record */
  followedBy?: string
  [k: string]: unknown
}

export function isRelationship(v: unknown): v is Relationship {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.graph.defs#relationship'
  )
}

export function validateRelationship(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.graph.defs#relationship', v)
}
