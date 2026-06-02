import type {
  CreateShoutInput,
  GetAlbumShoutsParams,
  GetArtistShoutsParams,
  GetProfileShoutsParams,
  GetShoutRepliesParams,
  GetTrackShoutsParams,
  RemoveShoutParams,
  ReplyShoutInput,
  ReportShoutInput,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export class ShoutNamespace {
  constructor(private readonly call: Call) {}

  createShout<T = unknown>(
    input: CreateShoutInput = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.createShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  replyShout<T = unknown>(
    input: ReplyShoutInput,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.replyShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  reportShout<T = unknown>(
    input: ReportShoutInput,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.reportShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  removeShout<T = unknown>(params: RemoveShoutParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.removeShout", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getShoutReplies<T = unknown>(params: GetShoutRepliesParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getShoutReplies", "GET", {
      params,
      ...opts,
    });
  }

  getProfileShouts<T = unknown>(
    params: GetProfileShoutsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.getProfileShouts", "GET", {
      params,
      ...opts,
    });
  }

  getTrackShouts<T = unknown>(
    params: GetTrackShoutsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.shout.getTrackShouts", "GET", {
      params,
      ...opts,
    });
  }

  getArtistShouts<T = unknown>(params: GetArtistShoutsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getArtistShouts", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumShouts<T = unknown>(params: GetAlbumShoutsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.shout.getAlbumShouts", "GET", {
      params,
      ...opts,
    });
  }
}
