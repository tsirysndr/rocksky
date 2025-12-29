/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyPlayerDefs from "./defs.ts";

export type QueryParams = {
  playerId?: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyPlayerDefs.PlaybackQueueViewDetailed;
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
