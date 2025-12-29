/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyFeedDefs from "./defs.ts";

export type QueryParams = {
  /** The feed URI. */
  feed: string;
  /** The maximum number of scrobbles to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyFeedDefs.FeedView;
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
