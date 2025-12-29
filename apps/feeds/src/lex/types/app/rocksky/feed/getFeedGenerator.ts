/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyFeedDefs from "./defs.ts";

export type QueryParams = {
  /** AT-URI of the feed generator record. */
  feed: string;
};
export type InputSchema = undefined;

export interface OutputSchema {
  view?: AppRockskyFeedDefs.FeedGeneratorView;
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
