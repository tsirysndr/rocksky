import type {
  GetCurrentlyPlayingParams,
  SeekParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class SpotifyNamespace {
  constructor(private readonly call: Call) {}

  getCurrentlyPlaying(
    params: GetCurrentlyPlayingParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.spotify.getCurrentlyPlaying", "GET", {
      params,
      ...opts,
    });
  }

  play(opts?: RequestOptions) {
    return this.call("app.rocksky.spotify.play", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  pause(opts?: RequestOptions) {
    return this.call("app.rocksky.spotify.pause", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  next(opts?: RequestOptions) {
    return this.call("app.rocksky.spotify.next", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  previous(opts?: RequestOptions) {
    return this.call("app.rocksky.spotify.previous", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  seek(params: SeekParams, opts?: RequestOptions) {
    return this.call("app.rocksky.spotify.seek", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
