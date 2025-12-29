/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  playerId?: string;
  directoryId: string;
  shuffle?: boolean;
  recurse?: boolean;
  position?: number;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | void;
