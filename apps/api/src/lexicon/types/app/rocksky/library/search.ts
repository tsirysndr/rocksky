/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";

export interface QueryParams {
  /** The search query. */
  query: string;
  /** Maximum number of artists to return. */
  artistCount?: number;
  /** Artist result offset. */
  artistOffset?: number;
  /** Maximum number of albums to return. */
  albumCount?: number;
  /** Album result offset. */
  albumOffset?: number;
  /** Maximum number of songs to return. */
  songCount?: number;
  /** Song result offset. */
  songOffset?: number;
}

export type InputSchema = undefined;

export interface OutputSchema {
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
