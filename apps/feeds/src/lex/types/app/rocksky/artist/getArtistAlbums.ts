/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyAlbumDefs from "../album/defs.ts";

export type QueryParams = {
  /** The URI of the artist to retrieve albums from */
  uri: string;
};
export type InputSchema = undefined;

export interface OutputSchema {
  albums?: (AppRockskyAlbumDefs.AlbumViewBasic)[];
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
