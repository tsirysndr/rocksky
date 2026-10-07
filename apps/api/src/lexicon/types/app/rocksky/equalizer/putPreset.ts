/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as AppRockskyRockboxDefs from "../rockbox/defs";
import type * as AppRockskyEqualizerDefs from "./defs";

export type QueryParams = {}

export interface InputSchema {
  /** Display name of the preset. */
  name: string;
  /** Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60 = -6.0 dB) */
  precut?: number;
  /** Up to 10 EQ bands */
  bands: AppRockskyRockboxDefs.EqualizerBand[];
  [k: string]: unknown;
}

export type OutputSchema = AppRockskyEqualizerDefs.PresetView;

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
