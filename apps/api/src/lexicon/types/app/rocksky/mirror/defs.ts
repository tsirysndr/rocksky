/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface MirrorSourceView {
  /** One of: lastfm, listenbrainz, tealfm */
  provider: string;
  /** Whether scrobbles from this source are being mirrored into Rocksky. */
  enabled: boolean;
  /** Username on the external service (Last.fm / ListenBrainz). Null for Teal.fm. */
  externalUsername?: string;
  /** True when an API key is stored. Last.fm/ListenBrainz only; always false for Teal.fm. */
  hasCredentials: boolean;
  /** The last time the mirror process successfully polled this source. */
  lastPolledAt?: string;
  /** Watermark — scrobbles from the external service older than this are skipped. */
  lastScrobbleSeenAt?: string;
  [k: string]: unknown;
}

export function isMirrorSourceView(v: unknown): v is MirrorSourceView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.mirror.defs#mirrorSourceView"
  );
}

export function validateMirrorSourceView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.mirror.defs#mirrorSourceView", v);
}
