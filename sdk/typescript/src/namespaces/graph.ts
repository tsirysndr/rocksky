import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type ActorParam = { actor: string };
export type FollowListParams = ActorParam & {
  limit?: number;
  cursor?: string;
  dids?: string[];
};
export type KnownFollowersParams = ActorParam & {
  limit?: number;
  cursor?: string;
};

export class GraphNamespace {
  constructor(private readonly call: Call) {}

  followAccount<T = unknown>(
    params: { account: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.followAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  unfollowAccount<T = unknown>(
    params: { account: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.unfollowAccount", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFollowers<T = unknown>(params: FollowListParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.graph.getFollowers", "GET", {
      params,
      ...opts,
    });
  }

  getFollows<T = unknown>(params: FollowListParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.graph.getFollows", "GET", {
      params,
      ...opts,
    });
  }

  getKnownFollowers<T = unknown>(
    params: KnownFollowersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.graph.getKnownFollowers", "GET", {
      params,
      ...opts,
    });
  }
}
