import { type HttpClientConfig, xrpcCall } from "../http.js";
import type { RequestOptions } from "../types.js";

export type Call = <T>(
  nsid: string,
  method: "GET" | "POST",
  opts?: {
    params?: object;
    body?: unknown;
    requireAuth?: boolean;
  } & RequestOptions,
) => Promise<T>;

export function makeCall(config: HttpClientConfig): Call {
  return (nsid, method, opts) =>
    xrpcCall(config, nsid, method, opts ?? {});
}
