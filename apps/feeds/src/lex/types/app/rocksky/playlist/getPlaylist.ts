/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyPlaylistDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the playlist to retrieve. */
  uri: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyPlaylistDefs.PlaylistViewDetailed;
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
