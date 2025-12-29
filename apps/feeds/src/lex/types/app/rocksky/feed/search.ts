/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyFeedDefs from "./defs.ts";

export type QueryParams = {
  /** The search query string */
  query: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyFeedDefs.SearchResultsView;
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
