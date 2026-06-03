/**
 * GENERATED CODE - DO NOT MODIFY
 */

import { BlobRef, ValidationResult } from "@atproto/lexicon";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type express from "express";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
import type * as AppRockskySongDefs from "./defs";

export interface QueryParams {
  /** The maximum number of songs to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The genre to filter artists by */
  genre?: string;
  /** Filter songs by MusicBrainz ID */
  mbid?: string;
  /** Filter songs by International Standard Recording Code (ISRC) */
  isrc?: string;
  /** Filter songs by Spotify track ID (resolved internally to the Spotify track URL) */
  spotifyId?: string;
}

export type InputSchema = undefined;

export interface OutputSchema {
  songs?: AppRockskySongDefs.SongViewBasic[];
  [k: string]: unknown;
}

export type HandlerInput = undefined;

export interface HandlerSuccess {
  encoding: "application/json";
  body: OutputSchema;
  headers?: { [key: string]: string };
}

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | HandlerSuccess | HandlerPipeThrough;
export type HandlerReqCtx<HA extends HandlerAuth = never> = {
  auth: HA;
  params: QueryParams;
  input: HandlerInput;
  req: express.Request;
  res: express.Response;
  resetRouteRateLimits: () => Promise<void>;
};
export type Handler<HA extends HandlerAuth = never> = (
  ctx: HandlerReqCtx<HA>,
) => Promise<HandlerOutput> | HandlerOutput;
