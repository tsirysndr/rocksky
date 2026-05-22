/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyArtistDefs from "../artist/defs";

export interface ProfileViewDetailed {
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
  [k: string]: unknown;
}

export function isProfileViewDetailed(v: unknown): v is ProfileViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#profileViewDetailed"
  );
}

export function validateProfileViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#profileViewDetailed", v);
}

export interface ProfileViewBasic {
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
  [k: string]: unknown;
}

export function isProfileViewBasic(v: unknown): v is ProfileViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#profileViewBasic"
  );
}

export function validateProfileViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#profileViewBasic", v);
}

export interface NeighbourViewBasic {
  userId?: string;
  did?: string;
  handle?: string;
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: string;
  /** The number of artists shared with the actor. */
  sharedArtistsCount?: number;
  /** The similarity score with the actor. */
  similarityScore?: number;
  /** The top shared artist names with the actor. */
  topSharedArtistNames?: string[];
  /** The top shared artist details with the actor. */
  topSharedArtistsDetails?: AppRockskyArtistDefs.ArtistViewBasic[];
  [k: string]: unknown;
}

export function isNeighbourViewBasic(v: unknown): v is NeighbourViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#neighbourViewBasic"
  );
}

export function validateNeighbourViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#neighbourViewBasic", v);
}

export interface CompatibilityViewBasic {
  compatibilityLevel?: number;
  compatibilityPercentage?: number;
  sharedArtists?: number;
  topSharedArtistNames?: string[];
  topSharedDetailedArtists?: ArtistViewBasic[];
  user1ArtistCount?: number;
  user2ArtistCount?: number;
  [k: string]: unknown;
}

export function isCompatibilityViewBasic(
  v: unknown,
): v is CompatibilityViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#compatibilityViewBasic"
  );
}

export function validateCompatibilityViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#compatibilityViewBasic", v);
}

export interface ArtistViewBasic {
  id?: string;
  name?: string;
  picture?: string;
  uri?: string;
  user1Rank?: number;
  user2Rank?: number;
  weight?: number;
  [k: string]: unknown;
}

export function isArtistViewBasic(v: unknown): v is ArtistViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#artistViewBasic"
  );
}

export function validateArtistViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#artistViewBasic", v);
}

export interface TrackView {
  /** The name of the track. */
  name: string;
  /** The primary artist name. */
  artist: string;
  /** The album name. */
  album?: string;
  /** URL of the album cover image. */
  albumCoverUrl?: string;
  /** Track duration in milliseconds. */
  durationMs?: number;
  /** Music service source, e.g. 'spotify' or 'listenbrainz'. */
  source?: string;
  [k: string]: unknown;
}

export function isTrackView(v: unknown): v is TrackView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.actor.defs#trackView"
  );
}

export function validateTrackView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.actor.defs#trackView", v);
}
