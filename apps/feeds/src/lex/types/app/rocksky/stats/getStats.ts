/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyStatsDefs from "./defs.ts";

export type QueryParams = {
  /** The DID or handle of the user to get stats for. */
  did: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyStatsDefs.StatsView;
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
