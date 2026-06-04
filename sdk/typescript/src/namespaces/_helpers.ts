import { type HttpClientConfig, xrpcCall } from "../http.js";
import type { RequestOptions } from "../types.js";
import type { Endpoints } from "../generated/types.js";

type CallOpts = {
  params?: object;
  body?: unknown;
  requireAuth?: boolean;
} & RequestOptions;

export interface Call {
  <K extends keyof Endpoints>(
    nsid: K,
    method: "GET" | "POST",
    opts?: CallOpts,
  ): Promise<Endpoints[K]>;
  <T = unknown>(
    nsid: string,
    method: "GET" | "POST",
    opts?: CallOpts,
  ): Promise<T>;
}

export function makeCall(config: HttpClientConfig): Call {
  return ((nsid: string, method: "GET" | "POST", opts?: CallOpts) =>
    xrpcCall(config, nsid, method, opts ?? {})) as Call;
}
