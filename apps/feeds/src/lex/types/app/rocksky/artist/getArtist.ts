/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyArtistDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the artist to retrieve details from */
  uri: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyArtistDefs.ArtistViewDetailed;
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
