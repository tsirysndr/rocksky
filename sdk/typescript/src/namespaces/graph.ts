import type {
  FollowAccountParams,
  GetFollowersParams,
  GetFollowsParams,
  GetKnownFollowersParams,
  UnfollowAccountParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type FollowListParams = GetFollowersParams;
export type KnownFollowersParams = GetKnownFollowersParams;

export class GraphNamespace {
  constructor(private readonly call: Call) {}

  followAccount<T = unknown>(
    params: FollowAccountParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.followAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  unfollowAccount<T = unknown>(
    params: UnfollowAccountParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.unfollowAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFollowers<T = unknown>(params: GetFollowersParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.graph.getFollowers", "GET", {
      params,
      ...opts,
    });
  }

  getFollows<T = unknown>(params: GetFollowsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.graph.getFollows", "GET", {
      params,
      ...opts,
    });
  }

  getKnownFollowers<T = unknown>(
    params: GetKnownFollowersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.getKnownFollowers", "GET", {
      params,
      ...opts,
    });
  }
}
