/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The URI of the playlist to start */
  uri: string;
  /** Whether to shuffle the playlist when starting it */
  shuffle?: boolean;
  /** The position in the playlist to start from, if not specified, starts from the beginning */
  position?: number;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
