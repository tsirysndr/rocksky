/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../util.ts";
import type * as ComAtprotoRepoStrongRef from "../../com/atproto/repo/strongRef.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.like";

export interface Record {
  $type: "app.rocksky.like";
  /** The date when the like was created. */
  createdAt: string;
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
