/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as AppRockskyChartsDefs from "./defs";

export interface QueryParams {
  /** The maximum number of scrobblers to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to count scrobbles from (ISO 8601 format) */
  startDate?: string;
  /** The end date to count scrobbles to (ISO 8601 format) */
  endDate?: string;
}

export type InputSchema = undefined;

export interface OutputSchema {
  scrobblers?: AppRockskyChartsDefs.ScrobblerViewBasic[];
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
