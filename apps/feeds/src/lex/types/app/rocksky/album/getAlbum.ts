/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyAlbumDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the album to retrieve. */
  uri: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyAlbumDefs.AlbumViewDetailed;
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
