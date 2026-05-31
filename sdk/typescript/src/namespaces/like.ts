import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type LikeInput = { uri?: string };

export class LikeNamespace {
  constructor(private readonly call: Call) {}

  likeSong<T = unknown>(input: LikeInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.likeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeSong<T = unknown>(input: LikeInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.dislikeSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  likeShout<T = unknown>(input: LikeInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.likeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  dislikeShout<T = unknown>(input: LikeInput = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.like.dislikeShout", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
