/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The URI of the playlist to start */
  uri: string;
  files: string[];
  /** The position in the playlist to insert the files at, if not specified, files will be appended */
  position?: number;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
