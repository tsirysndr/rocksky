/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type express from "express";
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type { HandlerAuth, HandlerPipeThrough } from "@atproto/xrpc-server";
import type * as AppRockskyPlaylistDefs from "../playlist/defs";

export interface QueryParams {
  /** The DID or handle of the actor */
  did: string;
  /** The maximum number of playlists to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** RSQL filter expression, e.g. `name=="Road trip*";track.artist=="Daft Punk"`. Supports ==, !=, <, <=, >, >=, =in=, =out=, and `;`/`and`, `,`/`or` combinators, `*` wildcards in string values. Filterable fields: name, title, description, uri, spotifyLink, tidalLink, appleMusicLink, createdAt, updatedAt. The `track.title`, `track.artist`, `track.album` and `track.albumArtist` selectors match the playlist's contents, returning playlists that contain a matching track; several `track.*` terms joined with `;` must all be satisfied by the same track. */
  filter?: string;
}

export type InputSchema = undefined;

export interface OutputSchema {
  playlists?: AppRockskyPlaylistDefs.PlaylistViewBasic[];
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
