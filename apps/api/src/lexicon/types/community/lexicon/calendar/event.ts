/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as CommunityLexiconLocationAddress from "../location/address";
import type * as CommunityLexiconLocationFsq from "../location/fsq";
import type * as CommunityLexiconLocationGeo from "../location/geo";
import type * as CommunityLexiconLocationHthree from "../location/hthree";

export interface Record {
  /** The name of the event. */
  name: string;
  /** The description of the event. */
  description?: string;
  /** Client-declared timestamp when the event was created. */
  createdAt: string;
  /** Client-declared timestamp when the event starts. */
  startsAt?: string;
  /** Client-declared timestamp when the event ends. */
  endsAt?: string;
  mode?: Mode;
  status?: Status;
  /** The locations where the event takes place. */
  locations?: (
    | Uri
    | CommunityLexiconLocationAddress.Main
    | CommunityLexiconLocationFsq.Main
    | CommunityLexiconLocationGeo.Main
    | CommunityLexiconLocationHthree.Main
    | { $type: string; [k: string]: unknown }
  )[];
  /** URIs associated with the event. */
  uris?: Uri[];
  /** Whether a response is requested from attendees. */
  rsvpExpected?: boolean;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "community.lexicon.calendar.event#main" ||
      v.$type === "community.lexicon.calendar.event")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.calendar.event#main", v);
}

/** The mode of the event. */
export type Mode =
  | "community.lexicon.calendar.event#hybrid"
  | "community.lexicon.calendar.event#inperson"
  | "community.lexicon.calendar.event#virtual"
  | (string & {});

/** A virtual event that takes place online. */
export const VIRTUAL = "community.lexicon.calendar.event#virtual";
/** An in-person event that takes place offline. */
export const INPERSON = "community.lexicon.calendar.event#inperson";
/** A hybrid event that takes place both online and offline. */
export const HYBRID = "community.lexicon.calendar.event#hybrid";

/** The status of the event. */
export type Status =
  | "community.lexicon.calendar.event#cancelled"
  | "community.lexicon.calendar.event#planned"
  | "community.lexicon.calendar.event#postponed"
  | "community.lexicon.calendar.event#rescheduled"
  | "community.lexicon.calendar.event#scheduled"
  | (string & {});

/** The event has been created, but not finalized. */
export const PLANNED = "community.lexicon.calendar.event#planned";
/** The event has been created and scheduled. */
export const SCHEDULED = "community.lexicon.calendar.event#scheduled";
/** The event has been rescheduled. */
export const RESCHEDULED = "community.lexicon.calendar.event#rescheduled";
/** The event has been cancelled. */
export const CANCELLED = "community.lexicon.calendar.event#cancelled";
/** The event has been postponed and a new start date has not been set. */
export const POSTPONED = "community.lexicon.calendar.event#postponed";

/** A URI associated with the event. */
export interface Uri {
  uri: string;
  /** The display name of the URI. */
  name?: string;
  [k: string]: unknown;
}

export function isUri(v: unknown): v is Uri {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "community.lexicon.calendar.event#uri"
  );
}

export function validateUri(v: unknown): ValidationResult {
  return lexicons.validate("community.lexicon.calendar.event#uri", v);
}
