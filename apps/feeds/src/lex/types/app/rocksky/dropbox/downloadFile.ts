/**
 * GENERATED CODE - DO NOT MODIFY
 */
export type QueryParams = {
  /** The unique identifier of the file to download */
  fileId: string;
};
export type InputSchema = undefined;
export type HandlerInput = void;

export interface HandlerSuccess {
  encoding: "application/octet-stream";
  body: Uint8Array | ReadableStream;
  headers?: { [key: string]: string };
}

export interface HandlerError {
  status: number;
  message?: string;
}

export type HandlerOutput = HandlerError | HandlerSuccess;
