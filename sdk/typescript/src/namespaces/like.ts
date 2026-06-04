import type {
  DislikeShoutInput,
  DislikeSongInput,
  LikeShoutInput,
  LikeSongInput,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type LikeInput = LikeSongInput;

export class LikeNamespace {
  constructor(private readonly call: Call) {}

  likeSong(input: LikeSongInput = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.like.likeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeSong(input: DislikeSongInput = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.like.dislikeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  likeShout(input: LikeShoutInput = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.like.likeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeShout(input: DislikeShoutInput = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.like.dislikeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
