/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.actor.defs";

export interface ProfileViewDetailed {
  $type?: "app.rocksky.actor.defs#profileViewDetailed";
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: string;
  /** The date and time when the actor was created. */
  createdAt?: string;
  /** The date and time when the actor was last updated. */
  updatedAt?: string;
}

const hashProfileViewDetailed = "profileViewDetailed";

export function isProfileViewDetailed<V>(v: V) {
  return is$typed(v, id, hashProfileViewDetailed);
}

export function validateProfileViewDetailed<V>(v: V) {
  return validate<ProfileViewDetailed & V>(v, id, hashProfileViewDetailed);
}

export interface ProfileViewBasic {
  $type?: "app.rocksky.actor.defs#profileViewBasic";
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: string;
  /** The date and time when the actor was created. */
  createdAt?: string;
  /** The date and time when the actor was last updated. */
  updatedAt?: string;
}

const hashProfileViewBasic = "profileViewBasic";

export function isProfileViewBasic<V>(v: V) {
  return is$typed(v, id, hashProfileViewBasic);
}

export function validateProfileViewBasic<V>(v: V) {
  return validate<ProfileViewBasic & V>(v, id, hashProfileViewBasic);
}
