/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyShoutDefs from "./defs.ts";

export type QueryParams = globalThis.Record<PropertyKey, never>;

export interface InputSchema {
  /** The content of the shout */
  message?: string;
}

export type OutputSchema = AppRockskyShoutDefs.ShoutView;

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
