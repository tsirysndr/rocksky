/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyDropboxDefs from "./defs.ts";

export type QueryParams = {
  /** Path to the Dropbox folder or root directory */
  at?: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyDropboxDefs.FileListView;
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
