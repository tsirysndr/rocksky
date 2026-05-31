import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

type UriPage = { uri: string; limit?: number; offset?: number };

export class ShoutNamespace {
  constructor(private readonly call: Call) {}

  createShout<T = unknown>(
    input: { message?: string } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.createShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  replyShout<T = unknown>(
    input: { shoutId: string; message: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.replyShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  reportShout<T = unknown>(
    input: { shoutId: string; reason?: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.reportShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  removeShout<T = unknown>(params: { id: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.removeShout", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getShoutReplies<T = unknown>(params: UriPage, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getShoutReplies", "GET", {
      params,
      ...opts,
    });
  }

  getProfileShouts<T = unknown>(
    params: { did: string; limit?: number; offset?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.getProfileShouts", "GET", {
      params,
      ...opts,
    });
  }

  getTrackShouts<T = unknown>(
    params: { uri: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.getTrackShouts", "GET", {
      params,
      ...opts,
    });
  }

  getArtistShouts<T = unknown>(params: UriPage, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getArtistShouts", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumShouts<T = unknown>(params: UriPage, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getAlbumShouts", "GET", {
      params,
      ...opts,
    });
  }
}
