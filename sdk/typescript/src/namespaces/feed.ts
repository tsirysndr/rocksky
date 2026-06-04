import type {
  GetAlbumRecommendationsParams,
  GetArtistRecommendationsParams,
  GetFeedGeneratorParams,
  GetFeedGeneratorsParams,
  GetFeedParams,
  GetFeedSkeletonParams,
  GetRecommendationsParams,
  GetStoriesParams,
  SearchParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type RecommendParams = GetRecommendationsParams;

export class FeedNamespace {
  constructor(private readonly call: Call) {}

  search<T = unknown>(params: SearchParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.feed.search", "GET", {
      params,
      ...opts,
    });
  }

  getFeed<T = unknown>(
    params: GetFeedParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeed", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerators<T = unknown>(
    params: GetFeedGeneratorsParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeedGenerators", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerator<T = unknown>(
    params: GetFeedGeneratorParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeedGenerator", "GET", {
      params,
      ...opts,
    });
  }

  describeFeedGenerator<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.feed.describeFeedGenerator", "GET", {
      ...opts,
    });
  }

  getFeedSkeleton<T = unknown>(
    params: GetFeedSkeletonParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeedSkeleton", "GET", {
      params,
      ...opts,
    });
  }

  getRecommendations<T = unknown>(
    params: GetRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecommendations<T = unknown>(
    params: GetArtistRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getArtistRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumRecommendations<T = unknown>(
    params: GetAlbumRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getAlbumRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getStories<T = unknown>(
    params: GetStoriesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getStories", "GET", {
      params,
      ...opts,
    });
  }
}
