/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyScrobbleDefs from "../scrobble/defs.ts";

export type QueryParams = {
  /** The feed URI. */
  feed: string;
  /** The maximum number of scrobbles to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The pagination cursor. */
  cursor?: string;
};
export type InputSchema = undefined;

export interface OutputSchema {
  scrobbles?: (AppRockskyScrobbleDefs.ScrobbleViewBasic)[];
  /** The pagination cursor for the next set of results. */
  cursor?: string;
}

export type HandlerInput = void;

export interface HandlerSuccess {
  encoding: "application/json";
  body: OutputSchema;
  headers?: { [key: string]: string };
}

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | HandlerSuccess;
