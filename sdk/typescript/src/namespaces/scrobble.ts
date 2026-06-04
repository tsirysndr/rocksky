import type {
  CreateScrobbleInput,
  GetScrobbleParams,
  GetScrobblesParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { CreateScrobbleInput, GetScrobblesParams };

export class ScrobbleNamespace {
  constructor(private readonly call: Call) {}

  createScrobble<T = unknown>(
    input: CreateScrobbleInput,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.scrobble.createScrobble", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  getScrobble<T = unknown>(params: GetScrobbleParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.scrobble.getScrobble", "GET", {
      params,
      ...opts,
    });
  }

  getScrobbles<T = unknown>(
    params: GetScrobblesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.scrobble.getScrobbles", "GET", {
      params,
      ...opts,
    });
  }
}
