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

  createScrobble(
    input: CreateScrobbleInput,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.scrobble.createScrobble", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  getScrobble(params: GetScrobbleParams, opts?: RequestOptions) {
    return this.call("app.rocksky.scrobble.getScrobble", "GET", {
      params,
      ...opts,
    });
  }

  getScrobbles(
    params: GetScrobblesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.scrobble.getScrobbles", "GET", {
      params,
      ...opts,
    });
  }
}
