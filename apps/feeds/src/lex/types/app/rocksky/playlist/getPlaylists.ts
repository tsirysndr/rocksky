/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyPlaylistDefs from "./defs.ts";

export type QueryParams = {
  /** The maximum number of playlists to return. */
  limit?: number;
  /** The offset for pagination, used to skip a number of playlists. */
  offset?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  playlists?: (AppRockskyPlaylistDefs.PlaylistViewBasic)[];
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
