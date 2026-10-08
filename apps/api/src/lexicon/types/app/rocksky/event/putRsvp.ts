/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";

export type QueryParams = {}

export interface InputSchema {
  /** The calendar or music event URI. */
  uri: string;
  status:
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  [k: string]: unknown;
}

export interface OutputSchema {
  /** The RSVP record URI. */
  uri: string;
  status:
    | "community.lexicon.calendar.rsvp#going"
    | "community.lexicon.calendar.rsvp#interested"
    | "community.lexicon.calendar.rsvp#notgoing"
    | (string & {});
  [k: string]: unknown;
}

export interface HandlerInput {
  encoding: "application/json";
  body: InputSchema;
}

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
