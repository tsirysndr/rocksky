/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The name of the playlist */
  name: string;
  /** A brief description of the playlist */
  description?: string;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
