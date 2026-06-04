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

  likeSong<T = unknown>(input: LikeSongInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.likeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeSong<T = unknown>(input: DislikeSongInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.dislikeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  likeShout<T = unknown>(input: LikeShoutInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.likeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeShout<T = unknown>(input: DislikeShoutInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.dislikeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
