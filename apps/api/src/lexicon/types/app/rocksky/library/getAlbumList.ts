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
  /** List type: newest, alphabeticalByName, alphabeticalByArtist, random, recent, byYear, byGenre, starred. */
  type: string;
  /** Number of albums to return (max 500). */
  size?: number;
  /** Offset for pagination. */
  offset?: number;
  /** First year in a byYear range. */
  fromYear?: number;
  /** Last year in a byYear range. */
  toYear?: number;
  /** Genre name when type is byGenre. */
  genre?: string;
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
