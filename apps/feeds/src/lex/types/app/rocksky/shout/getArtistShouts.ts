/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyShoutDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the artist to retrieve shouts for */
  uri: string;
  /** The maximum number of shouts to return */
  limit?: number;
  /** The number of shouts to skip before starting to collect the result set */
  offset?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  shouts?: (AppRockskyShoutDefs.ShoutViewBasic)[];
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
