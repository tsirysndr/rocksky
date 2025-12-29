/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskySongDefs from "./defs.ts";

export type QueryParams = {
  /** The unique identifier of the song to retrieve */
  uri: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskySongDefs.SongViewDetailed;
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
