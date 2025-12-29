/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyShoutDefs from "./defs.ts";

export type QueryParams = {
  /** The DID or handle of the actor */
  did: string;
  /** The offset for pagination */
  offset?: number;
  /** The maximum number of shouts to return */
  limit?: number;
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
