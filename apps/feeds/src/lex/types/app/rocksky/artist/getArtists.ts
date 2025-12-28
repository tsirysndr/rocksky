/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyArtistDefs from "./defs.ts";

export type QueryParams = {
  /** The maximum number of artists to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The names of the artists to return */
  names?: string;
};
export type InputSchema = undefined;

export interface OutputSchema {
  artists?: (AppRockskyArtistDefs.ArtistViewBasic)[];
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
