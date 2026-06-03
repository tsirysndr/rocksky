/**
 * GENERATED CODE - DO NOT MODIFY
 */

import { BlobRef, ValidationResult } from "@atproto/lexicon";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type express from "express";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
import type * as AppRockskyApikeyDefs from "./defs";

export type QueryParams = {};

export interface InputSchema {
  /** The ID of the API key to update. */
  id: string;
  /** The new name of the API key. */
  name: string;
  /** A new description for the API key. */
  description?: string;
  [k: string]: unknown;
}

export type OutputSchema = AppRockskyApikeyDefs.ApiKey;

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
