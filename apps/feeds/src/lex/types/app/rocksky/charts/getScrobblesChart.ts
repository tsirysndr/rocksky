/**
 * GENERATED CODE - DO NOT MODIFY
 */
import type * as AppRockskyChartsDefs from "./defs.ts";

export type QueryParams = {
  /** The DID or handle of the actor */
  did?: string;
  /** The URI of the artist to filter by */
  artisturi?: string;
  /** The URI of the album to filter by */
  albumuri?: string;
  /** The URI of the track to filter by */
  songuri?: string;
};
export type InputSchema = undefined;
export type OutputSchema = AppRockskyChartsDefs.ChartsView;
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
