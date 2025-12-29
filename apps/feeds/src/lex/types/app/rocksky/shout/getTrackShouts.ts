/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyShoutDefs from "./defs.ts";

export type QueryParams = {
  /** The URI of the track to retrieve shouts for */
  uri: string;
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
