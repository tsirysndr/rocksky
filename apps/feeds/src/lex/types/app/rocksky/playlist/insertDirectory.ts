/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The URI of the playlist to start */
  uri: string;
  /** The directory (id) to insert into the playlist */
  directory: string;
  /** The position in the playlist to insert the directory at, if not specified, the directory will be appended */
  position?: number;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
