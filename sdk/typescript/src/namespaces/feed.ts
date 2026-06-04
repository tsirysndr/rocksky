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

  search(params: SearchParams, opts?: RequestOptions) {
    return this.call("app.rocksky.feed.search", "GET", {
      params,
      ...opts,
    });
  }

  getFeed(
    params: GetFeedParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getFeed", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerators(
    params: GetFeedGeneratorsParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getFeedGenerators", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerator(
    params: GetFeedGeneratorParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getFeedGenerator", "GET", {
      params,
      ...opts,
    });
  }

  describeFeedGenerator(opts?: RequestOptions) {
    return this.call("app.rocksky.feed.describeFeedGenerator", "GET", {
      ...opts,
    });
  }

  getFeedSkeleton(
    params: GetFeedSkeletonParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getFeedSkeleton", "GET", {
      params,
      ...opts,
    });
  }

  getRecommendations(
    params: GetRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecommendations(
    params: GetArtistRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getArtistRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumRecommendations(
    params: GetAlbumRecommendationsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getAlbumRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getStories(
    params: GetStoriesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.feed.getStories", "GET", {
      params,
      ...opts,
    });
  }
}
