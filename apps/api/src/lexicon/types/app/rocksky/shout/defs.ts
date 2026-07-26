/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface Author {
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
  [k: string]: unknown;
}

export function isAuthor(v: unknown): v is Author {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.shout.defs#author"
  );
}

export function validateAuthor(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.shout.defs#author", v);
}

export interface ShoutView {
  /** The unique identifier of the shout. */
  id?: string;
  /** The content of the shout. */
  message?: string;
  /** The ID of the parent shout if this is a reply, otherwise null. */
  parent?: string;
  /** The date and time when the shout was created. */
  createdAt?: string;
  author?: Author;
  gif?: Gif;
  /** Mentions of other actors within the message, anchored to UTF-8 byte ranges. */
  facets?: Mention[];
  [k: string]: unknown;
}

export function isShoutView(v: unknown): v is ShoutView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.shout.defs#shoutView"
  );
}

export function validateShoutView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.shout.defs#shoutView", v);
}

/** A mention of another actor within the shout message, anchored to a UTF-8 byte range in the message. */
export interface Mention {
  /** The DID of the mentioned actor. */
  did: string;
  /** Inclusive UTF-8 byte offset of the mention start. */
  byteStart: number;
  /** Exclusive UTF-8 byte offset of the mention end. */
  byteEnd: number;
  [k: string]: unknown;
}

export function isMention(v: unknown): v is Mention {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.shout.defs#mention"
  );
}

export function validateMention(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.shout.defs#mention", v);
}

/** A GIF, sticker, or clip embedded in a shout. `url` may point at an image (GIF/WebP) or a video (MP4); the client decides how to render it from the file extension. */
export interface Gif {
  /** Direct URL of the animated GIF/MP4. */
  url: string;
  /** Smaller still/preview image URL. */
  previewUrl?: string;
  /** Alternative text describing the media. */
  alt?: string;
  /** The intrinsic width of the media in pixels. */
  width?: number;
  /** The intrinsic height of the media in pixels. */
  height?: number;
  [k: string]: unknown;
}

export function isGif(v: unknown): v is Gif {
  return (
    isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.shout.defs#gif"
  );
}

export function validateGif(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.shout.defs#gif", v);
}
