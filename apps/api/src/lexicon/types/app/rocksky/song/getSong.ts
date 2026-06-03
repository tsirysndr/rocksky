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
  /** The AT-URI of the song to retrieve */
  uri?: string;
  /** The MusicBrainz ID of the song to retrieve */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song to retrieve */
  isrc?: string;
  /** The Spotify track ID of the song to retrieve (resolved internally to the Spotify track URL) */
  spotifyId?: string;
}

export type InputSchema = undefined;
export type OutputSchema = AppRockskySongDefs.SongViewDetailed;
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
