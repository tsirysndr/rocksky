/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyApikeyDefs from "./defs.ts";

export type QueryParams = {
  /** The number of API keys to skip before starting to collect the result set. */
  offset?: number;
  /** The number of API keys to return per page. */
  limit?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  apiKeys?: (AppRockskyApikeyDefs.ApikeyView)[];
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
