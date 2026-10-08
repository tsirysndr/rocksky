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
  /** AT-URI of the community.lexicon.calendar.event or app.rocksky.event.music record. */
  uri: string;
  /** Only responses with this status. */
  status?:
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  limit: number;
  offset: number;
}

export type InputSchema = undefined;

export interface OutputSchema {
  rsvps: AppRockskyEventDefs.RsvpView[];
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
