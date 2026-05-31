import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export class SpotifyNamespace {
  constructor(private readonly call: Call) {}

  getCurrentlyPlaying<T = unknown>(
    params: { actor?: string } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.spotify.getCurrentlyPlaying", "GET", {
      params,
      ...opts,
    });
  }

  play<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.spotify.play", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  pause<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.spotify.pause", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  next<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.spotify.next", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  previous<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.spotify.previous", "POST", {
      requireAuth: true,
      ...opts,
    });
  }

  seek<T = unknown>(params: { position: number }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.spotify.seek", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
