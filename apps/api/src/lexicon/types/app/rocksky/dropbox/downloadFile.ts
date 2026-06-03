/**
 * GENERATED CODE - DO NOT MODIFY
 */

import { BlobRef, ValidationResult } from "@atproto/lexicon";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type express from "express";
import { CID } from "multiformats/cid";
import type stream from "stream";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";

export interface QueryParams {
  /** The unique identifier of the file to download */
  fileId: string;
}

export type InputSchema = undefined;
export type HandlerInput = undefined;

export interface HandlerSuccess {
  encoding: "application/octet-stream";
  body: Uint8Array | stream.Readable;
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
