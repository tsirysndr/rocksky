/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskySongDefs from "./defs.ts";

export type QueryParams = {
  /** The maximum number of songs to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  songs?: (AppRockskySongDefs.SongViewBasic)[];
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
