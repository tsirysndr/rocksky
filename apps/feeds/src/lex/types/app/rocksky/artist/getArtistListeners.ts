/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyArtistDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the artist to retrieve listeners from */
  uri: string;
  /** Number of items to skip before returning results */
  offset?: number;
  /** Maximum number of results to return */
  limit?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  listeners?: (AppRockskyArtistDefs.ListenerViewBasic)[];
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
