/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyFeedDefs from "./defs.ts";

export type QueryParams = {
  /** The maximum number of now playing tracks to return. */
  size?: number;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyFeedDefs.NowPlayingsView;
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
