/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as AppRockskyEventDefs from "./defs";

export interface QueryParams {
  /** Only events this artist plays: the artist's AT-URI, id or sha256. */
  artist?: string;
  /** Only events published by this repo. */
  did?: string;
  /** Only events this DID has RSVP'd to (going or interested). */
  rsvpBy?: string;
  /** Only events of this kind (concert, festival...). */
  kind?: string;
  /** Only events whose genre matches (case-insensitive). */
  genre?: string;
  /** Only events that end at or after this time. Defaults to the start of today (UTC) when neither `to` nor `includePast` is given. */
  from?: string;
  /** Only events that start at or before this time. */
  to?: string;
  /** Return past events too, most recent first, instead of upcoming ones. */
  includePast?: boolean;
  /** The maximum number of events to return. */
  limit: number;
  /** The offset for pagination. */
  offset: number;
}

export type InputSchema = undefined;

export interface OutputSchema {
  events: AppRockskyEventDefs.EventView[];
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
