/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyGoogledriveDefs from "./defs.ts";

export type QueryParams = {
  /** The unique identifier of the file to retrieve */
  fileId: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyGoogledriveDefs.FileView;
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
