/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as AppRockskyAlbumDefs from "./defs";

export interface QueryParams {
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The genre to filter artists by */
  genre?: string;
  /** RSQL filter expression, e.g. `artist=="Daft Punk";year=ge=2000`. Supports ==, !=, <, <=, >, >=, =in=, =out=, and `;`/`and`, `,`/`or` combinators, `*` wildcards in string values. Filterable fields: title, artist, year, releaseDate, sha256, uri, artistUri, createdAt */
  filter?: string;
}

export type InputSchema = undefined;

export interface OutputSchema {
  albums?: AppRockskyAlbumDefs.AlbumViewBasic[];
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
