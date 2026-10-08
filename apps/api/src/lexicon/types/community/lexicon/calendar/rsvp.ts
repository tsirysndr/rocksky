/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as ComAtprotoRepoStrongRef from "../../../com/atproto/repo/strongRef";

export interface Record {
  subject: ComAtprotoRepoStrongRef.Main;
  status:
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.calendar.rsvp#main" ||
      v.$type === "community.lexicon.calendar.rsvp")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.calendar.rsvp#main", v);
}

/** Interested in the event */
export const INTERESTED = "community.lexicon.calendar.rsvp#interested";
/** Going to the event */
export const GOING = "community.lexicon.calendar.rsvp#going";
/** Not going to the event */
export const NOTGOING = "community.lexicon.calendar.rsvp#notgoing";
