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

  followAccount(
    params: FollowAccountParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.graph.followAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  unfollowAccount(
    params: UnfollowAccountParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.graph.unfollowAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFollowers(params: GetFollowersParams, opts?: RequestOptions) {
    return this.call("app.rocksky.graph.getFollowers", "GET", {
      params,
      ...opts,
    });
  }

  getFollows(params: GetFollowsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.graph.getFollows", "GET", {
      params,
      ...opts,
    });
  }

  getKnownFollowers(
    params: GetKnownFollowersParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.graph.getKnownFollowers", "GET", {
      params,
      ...opts,
    });
  }
}
