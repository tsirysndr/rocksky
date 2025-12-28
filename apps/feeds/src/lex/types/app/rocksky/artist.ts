/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type { BlobRef } from "@atp/lexicon";
import { validate as _validate } from "../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.artist";

export interface Record {
  $type: "app.rocksky.artist";
  /** The name of the artist. */
  name: string;
  /** The biography of the artist. */
  bio?: string;
  /** The picture of the artist. */
  picture?: BlobRef;
  /** The URL of the picture of the artist. */
  pictureUrl?: string;
  /** The tags of the artist. */
  tags?: (string)[];
  /** The birth date of the artist. */
  born?: string;
  /** The death date of the artist. */
  died?: string;
  /** The birth place of the artist. */
  bornIn?: string;
  /** The date when the artist was created. */
  createdAt: string;
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
