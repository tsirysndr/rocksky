/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskySongDefs from "../song/defs.ts";

export type QueryParams = globalThis.Record<PropertyKey, never>;

export interface InputSchema {
  /** The unique identifier of the song to dislike */
  uri?: string;
}

export type OutputSchema = AppRockskySongDefs.SongViewDetailed;

export interface HandlerInput {
  encoding: "application/json";
  body: InputSchema;
}

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
