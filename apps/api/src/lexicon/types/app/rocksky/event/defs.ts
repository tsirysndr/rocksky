/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyEventMusic from "./music";

/** A music event: the calendar event merged with its app.rocksky.event.music annotation. */
export interface EventView {
  /** The unique identifier of the event. */
  id: string;
  /** AT-URI of the community.lexicon.calendar.event record. */
  uri: string;
  /** CID of the calendar event record revision that was indexed. */
  cid?: string;
  /** AT-URI of the app.rocksky.event.music record. */
  musicUri: string;
  /** CID of the music record revision that was indexed. */
  musicCid?: string;
  /** The name of the event. */
  name: string;
  /** The description of the event. */
  description?: string;
  /** What sort of music event this is (concert, festival...). */
  kind?:
    | "concert"
    | "festival"
    | "club-night"
    | "dj-set"
    | "livestream"
    | "release-party"
    | "listening-party"
    | (string & {});
  /** The main genre of the event. */
  genre?: string;
  tags?: string[];
  /** When the event starts. */
  startsAt?: string;
  /** When the event ends. */
  endsAt?: string;
  /** The attendance mode, as a community.lexicon.calendar.event#mode token. */
  mode?:
    | "community.lexicon.calendar.event#inperson"
    | "community.lexicon.calendar.event#virtual"
    | "community.lexicon.calendar.event#hybrid"
    | (string & {});
  /** The event status, as a community.lexicon.calendar.event#status token. */
  status?:
    | "community.lexicon.calendar.event#planned"
    | "community.lexicon.calendar.event#scheduled"
    | "community.lexicon.calendar.event#rescheduled"
    | "community.lexicon.calendar.event#cancelled"
    | "community.lexicon.calendar.event#postponed"
    | (string & {});
  /** Poster or banner image of the event. */
  imageUrl?: string;
  /** Where tickets can be bought. */
  ticketsUrl?: string;
  /** Where the event takes place. */
  locations: LocationView[];
  /** Links associated with the event. */
  uris: UriView[];
  /** The lineup, in billing order. */
  artists: ArtistView[];
  externalIds?: AppRockskyEventMusic.ExternalIds;
  /** The DID of the repo that published the event. */
  organizerDid: string;
  /** The handle of the publisher. */
  organizerHandle?: string;
  /** The display name of the publisher. */
  organizerName?: string;
  /** The avatar of the publisher. */
  organizerAvatarUrl?: string;
  rsvpCounts: RsvpCounts;
  /** The authenticated viewer's RSVP, as a community.lexicon.calendar.rsvp status token. Absent when not authenticated or when the viewer has not responded. */
  viewerRsvp?:
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  /** When the event record was created. */
  createdAt: string;
  /** When the event was last indexed. */
  updatedAt: string;
  [k: string]: unknown;
}

export function isEventView(v: unknown): v is EventView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#eventView"
  );
}

export function validateEventView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#eventView", v);
}

/** An artist on an event lineup, linked to the Rocksky artist when one was resolved. */
export interface ArtistView {
  /** The unique identifier of the linked Rocksky artist. */
  id?: string;
  /** AT-URI of the linked artist. */
  uri?: string;
  /** The SHA256 hash of the linked artist. */
  sha256?: string;
  /** The artist name as billed on the event. */
  name: string;
  /** The picture of the linked artist. */
  picture?: string;
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
  /** The stage the artist plays on. */
  stage?: string;
  /** When this artist's set starts. */
  startsAt?: string;
  [k: string]: unknown;
}

export function isArtistView(v: unknown): v is ArtistView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#artistView"
  );
}

export function validateArtistView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#artistView", v);
}

/** One entry of the calendar event's locations, flattened: `type` says which community.lexicon.location shape it came from, and only the fields of that shape are set. */
export interface LocationView {
  type:
    | "community.lexicon.location.address"
    | "community.lexicon.location.geo"
    | "community.lexicon.location.fsq"
    | "community.lexicon.location.hthree"
    | "community.lexicon.calendar.event#uri"
    | (string & {});
  /** The name of the location (venue name). */
  name?: string;
  /** ISO 3166 country code. */
  country?: string;
  postalCode?: string;
  region?: string;
  /** City or town. */
  locality?: string;
  street?: string;
  latitude?: string;
  longitude?: string;
  altitude?: string;
  /** Foursquare Open Source Places id. */
  fsqPlaceId?: string;
  /** H3 encoded location. */
  h3?: string;
  /** A URL standing in for the location (online events). */
  uri?: string;
  [k: string]: unknown;
}

export function isLocationView(v: unknown): v is LocationView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#locationView"
  );
}

export function validateLocationView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#locationView", v);
}

export interface UriView {
  uri: string;
  /** The display name of the URI. */
  name?: string;
  [k: string]: unknown;
}

export function isUriView(v: unknown): v is UriView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#uriView"
  );
}

export function validateUriView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#uriView", v);
}

export interface RsvpCounts {
  going: number;
  interested: number;
  notGoing: number;
  [k: string]: unknown;
}

export function isRsvpCounts(v: unknown): v is RsvpCounts {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#rsvpCounts"
  );
}

export function validateRsvpCounts(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#rsvpCounts", v);
}

/** A community.lexicon.calendar.rsvp on an event, with its author. */
export interface RsvpView {
  /** AT-URI of the rsvp record. */
  uri: string;
  cid?: string;
  status:
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
  createdAt: string;
  [k: string]: unknown;
}

export function isRsvpView(v: unknown): v is RsvpView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.event.defs#rsvpView"
  );
}

export function validateRsvpView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.event.defs#rsvpView", v);
}
