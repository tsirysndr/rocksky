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
  /** What sort of music event this is. */
  kind?:
    | "concert"
    | "festival"
    | "club-night"
    | "dj-set"
    | "livestream"
    | "release-party"
    | "listening-party"
    | (string & {});
  /** The lineup, in billing order. */
  artists: Artist[];
  /** The main genre of the event. */
  genre?: string;
  /** Free-form tags (sub-genres, scene, tour name...). */
  tags?: string[];
  externalIds?: ExternalIds;
  /** Where tickets can be bought. */
  ticketsUrl?: string;
  /** Poster or banner image of the event. */
  imageUrl?: string;
  /** Client-declared timestamp when this record was created. */
  createdAt: string;
  [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    (v.$type === "app.rocksky.event.music#main" ||
      v.$type === "app.rocksky.event.music")
  );
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.music#main", v);
}

/** An artist on the lineup. */
export interface Artist {
  /** The artist name as billed. */
  name: string;
  /** AT-URI of the app.rocksky.artist record, when the artist is known to Rocksky. */
  uri?: string;
  /** MusicBrainz artist id. */
  mbid?: string;
  /** The artist's billing on this event. */
  role?:
    | "headliner"
    | "support"
    | "opener"
    | "dj"
    | "special-guest"
    | "performer"
    | (string & {});
  /** The stage the artist plays on, for multi-stage events such as festivals. */
  stage?: string;
  /** When this artist's set starts. */
  startsAt?: string;
  [k: string]: unknown;
}

export function isArtist(v: unknown): v is Artist {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.music#artist"
  );
}

export function validateArtist(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.music#artist", v);
}

/** Identifiers of the event on other services. */
export interface ExternalIds {
  ticketmaster?: string;
  songkick?: string;
  bandsintown?: string;
  residentAdvisor?: string;
  setlistfm?: string;
  dice?: string;
  eventbrite?: string;
  [k: string]: unknown;
}

export function isExternalIds(v: unknown): v is ExternalIds {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.music#externalIds"
  );
}

export function validateExternalIds(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.music#externalIds", v);
}
