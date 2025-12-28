/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The URI of the playlist to remove the track from */
  uri: string;
  /** The position of the track to remove in the playlist */
  position: number;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
