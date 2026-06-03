/**
 * GENERATED CODE - DO NOT MODIFY
 */

import { BlobRef, ValidationResult } from "@atproto/lexicon";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type express from "express";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
import type * as AppRockskyMirrorDefs from "./defs";

export type QueryParams = {};

export interface InputSchema {
  /** One of: lastfm, listenbrainz, tealfm */
  provider: string;
  /** Enable or disable mirroring for this provider. */
  enabled?: boolean;
  /** External username (Last.fm / ListenBrainz). Required when enabling those providers. Ignored for Teal.fm. */
  externalUsername?: string;
  /** API key / token to be encrypted at rest. Omit to leave the existing key unchanged. Pass an empty string to clear it. */
  apiKey?: string;
  [k: string]: unknown;
}

export type OutputSchema = AppRockskyMirrorDefs.MirrorSourceView;

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
