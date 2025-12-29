/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../util.ts";
import type * as ComAtprotoRepoStrongRef from "../../com/atproto/repo/strongRef.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.shout";

export interface Record {
  $type: "app.rocksky.shout";
  /** The message of the shout. */
  message: string;
  /** The date when the shout was created. */
  createdAt: string;
  parent?: ComAtprotoRepoStrongRef.Main;
  subject: ComAtprotoRepoStrongRef.Main;
  [k: string]: unknown;
}

const hashRecord = "main";

export function isRecord<V>(v: V) {
  return is$typed(v, id, hashRecord);
}

export function validateRecord<V>(v: V) {
  return validate<Record & V>(v, id, hashRecord, true);
}

export type Main = Record;
