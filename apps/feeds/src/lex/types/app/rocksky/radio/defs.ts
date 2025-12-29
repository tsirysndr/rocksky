/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.radio.defs";

export interface RadioViewBasic {
  $type?: "app.rocksky.radio.defs#radioViewBasic";
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The date and time when the radio was created. */
  createdAt?: string;
}

const hashRadioViewBasic = "radioViewBasic";

export function isRadioViewBasic<V>(v: V) {
  return is$typed(v, id, hashRadioViewBasic);
}

export function validateRadioViewBasic<V>(v: V) {
  return validate<RadioViewBasic & V>(v, id, hashRadioViewBasic);
}

export interface RadioViewDetailed {
  $type?: "app.rocksky.radio.defs#radioViewDetailed";
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The website of the radio. */
  website?: string;
  /** The streaming URL of the radio. */
  url?: string;
  /** The genre of the radio. */
  genre?: string;
  /** The logo of the radio station. */
  logo?: string;
  /** The date and time when the radio was created. */
  createdAt?: string;
}

const hashRadioViewDetailed = "radioViewDetailed";

export function isRadioViewDetailed<V>(v: V) {
  return is$typed(v, id, hashRadioViewDetailed);
}

export function validateRadioViewDetailed<V>(v: V) {
  return validate<RadioViewDetailed & V>(v, id, hashRadioViewDetailed);
}
