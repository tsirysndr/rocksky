/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyApikeyDefs from "./defs.ts";

export type QueryParams = globalThis.Record<PropertyKey, never>;

export interface InputSchema {
  /** The name of the API key. */
  name: string;
  /** A description for the API key. */
  description?: string;
}

export type OutputSchema = AppRockskyApikeyDefs.ApiKey;

export interface HandlerInput {
  encoding: "application/json";
  body: InputSchema;
}

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
