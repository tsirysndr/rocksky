/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'

export interface ProfileViewDetailed {
  /** The DID of the actor. */
  did?: string
  /** The handle of the actor. */
  handle?: string
  /** The display name of the actor. */
  displayName?: string
  /** The URL of the actor's avatar image. */
  avatarUrl?: string
  /** The date and time when the actor was created. */
  createdAt?: string
  [k: string]: unknown
}

export function isProfileViewDetailed(v: unknown): v is ProfileViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.actor.defs#profileViewDetailed'
  )
}

export function validateProfileViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.actor.defs#profileViewDetailed', v)
}

export interface ProfileViewBasic {
  /** The DID of the actor. */
  did?: string
  /** The handle of the actor. */
  handle?: string
  /** The display name of the actor. */
  displayName?: string
  /** The URL of the actor's avatar image. */
  avatarUrl?: string
  [k: string]: unknown
}

export function isProfileViewBasic(v: unknown): v is ProfileViewBasic {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'app.rocksky.actor.defs#profileViewBasic'
  )
}

export function validateProfileViewBasic(v: unknown): ValidationResult {
  return lexicons.validate('app.rocksky.actor.defs#profileViewBasic', v)
}
