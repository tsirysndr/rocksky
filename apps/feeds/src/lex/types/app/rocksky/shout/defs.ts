/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.shout.defs";

export interface Author {
  $type?: "app.rocksky.shout.defs#author";
  /** The unique identifier of the author. */
  id?: string;
  /** The decentralized identifier (DID) of the author. */
  did?: string;
  /** The handle of the author. */
  handle?: string;
  /** The display name of the author. */
  displayName?: string;
  /** The URL of the author's avatar image. */
  avatar?: string;
}

const hashAuthor = "author";

export function isAuthor<V>(v: V) {
  return is$typed(v, id, hashAuthor);
}

export function validateAuthor<V>(v: V) {
  return validate<Author & V>(v, id, hashAuthor);
}

export interface ShoutView {
  $type?: "app.rocksky.shout.defs#shoutView";
  /** The unique identifier of the shout. */
  id?: string;
  /** The content of the shout. */
  message?: string;
  /** The ID of the parent shout if this is a reply, otherwise null. */
  parent?: string;
  /** The date and time when the shout was created. */
  createdAt?: string;
  author?: Author;
}

const hashShoutView = "shoutView";

export function isShoutView<V>(v: V) {
  return is$typed(v, id, hashShoutView);
}

export function validateShoutView<V>(v: V) {
  return validate<ShoutView & V>(v, id, hashShoutView);
}
