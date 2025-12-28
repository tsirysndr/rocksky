import { Context } from "../context.ts";

export interface Algorithm {
  handler: AlgoHandler;
  needsAuth: boolean;
  publisherDid: string;
  rkey: string;
}

export interface feedParams {
  feed: string;
  limit?: number;
  cursor?: string;
}

export interface FeedResponse {
  cursor?: string;
  feed: Array<{ scrobble: string }>;
}

export type AlgoHandler = (
  ctx: Context,
  params: feedParams,
  did?: string | null,
) => Promise<FeedResponse>;
