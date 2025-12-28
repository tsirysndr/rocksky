/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyScrobbleDefs from "../scrobble/defs.ts";

export type QueryParams = {
  /** The DID or handle of the actor */
  did: string;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
};
export type InputSchema = undefined;

export interface OutputSchema {
  scrobbles?: (AppRockskyScrobbleDefs.ScrobbleViewBasic)[];
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
