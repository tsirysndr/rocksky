/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../../lexicons";
import { isObj, hasProp } from "../../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as FmTealAlphaFeedDefs from "./defs";

export interface QueryParams {
  /** The author's DID for the play */
  authorDID: string;
  /** The cursor to start the query from */
  cursor?: string;
  /** The upper limit of tracks to get per request. Default is 20, max is 50. */
  limit?: number;
}

export type InputSchema = undefined;

export interface OutputSchema {
  plays: FmTealAlphaFeedDefs.PlayView[];
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
