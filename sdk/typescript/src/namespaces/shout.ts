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
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class ShoutNamespace {
  constructor(private readonly call: Call) {}

  createShout(
    input: CreateShoutInput = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.shout.createShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  replyShout(
    input: ReplyShoutInput,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.shout.replyShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  reportShout(
    input: ReportShoutInput,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.shout.reportShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  removeShout(params: RemoveShoutParams, opts?: RequestOptions) {
    return this.call("app.rocksky.shout.removeShout", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getShoutReplies(params: GetShoutRepliesParams, opts?: RequestOptions) {
    return this.call("app.rocksky.shout.getShoutReplies", "GET", {
      params,
      ...opts,
    });
  }

  getProfileShouts(
    params: GetProfileShoutsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.shout.getProfileShouts", "GET", {
      params,
      ...opts,
    });
  }

  getTrackShouts(
    params: GetTrackShoutsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.shout.getTrackShouts", "GET", {
      params,
      ...opts,
    });
  }

  getArtistShouts(params: GetArtistShoutsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.shout.getArtistShouts", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumShouts(params: GetAlbumShoutsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.shout.getAlbumShouts", "GET", {
      params,
      ...opts,
    });
  }
}
