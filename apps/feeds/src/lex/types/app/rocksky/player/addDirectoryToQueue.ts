/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  playerId?: string;
  /** The directory to add to the queue */
  directory: string;
  /** Position in the queue to insert the directory at, defaults to the end if not specified */
  position?: number;
  /** Whether to shuffle the added directory in the queue */
  shuffle?: boolean;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
