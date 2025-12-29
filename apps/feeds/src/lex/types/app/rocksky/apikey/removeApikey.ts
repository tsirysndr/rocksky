/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyApikeyDefs from "./defs.ts";

export type QueryParams = {
  /** The ID of the API key to remove. */
  id: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyApikeyDefs.ApiKey;
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
