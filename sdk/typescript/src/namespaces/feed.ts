import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type RecommendParams = { did: string; limit?: number };

export class FeedNamespace {
  constructor(private readonly call: Call) {}

  search<T = unknown>(params: { query: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.feed.search", "GET", {
      params,
      ...opts,
    });
  }

  getFeed<T = unknown>(
    params: { feed: string; limit?: number; cursor?: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeed", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerators<T = unknown>(
    params: { size?: number } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeedGenerators", "GET", {
      params,
      ...opts,
    });
  }

  getFeedGenerator<T = unknown>(
    params: { feed: string },
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
    params: {
      feed: string;
      limit?: number;
      offset?: number;
      cursor?: string;
    },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getFeedSkeleton", "GET", {
      params,
      ...opts,
    });
  }

  getRecommendations<T = unknown>(
    params: RecommendParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecommendations<T = unknown>(
    params: RecommendParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getArtistRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumRecommendations<T = unknown>(
    params: RecommendParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getAlbumRecommendations", "GET", {
      params,
      ...opts,
    });
  }

  getStories<T = unknown>(
    params: { size?: number } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.feed.getStories", "GET", {
      params,
      ...opts,
    });
  }
}
