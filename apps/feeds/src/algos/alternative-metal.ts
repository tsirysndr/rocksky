import { Context } from "../context.ts";
import { Algorithm, feedParams } from "./types.ts";
import schema from "../schema/mod.ts";
import { arrayContains, desc, eq } from "drizzle-orm";

interface QueryFilter {
  indexedAt?: { $lt: Date };
}

const handler = async (
  ctx: Context,
  params: feedParams,
  _did?: string | null,
) => {
  const { limit = 50, cursor } = params;

  const query: QueryFilter = {};

  if (cursor) {
    query.indexedAt = { $lt: new Date(parseInt(cursor, 10)) };
  }

  const scrobbles = await ctx.db
    .select()
    .from(schema.scrobbles)
    .leftJoin(schema.artists, eq(schema.scrobbles.artistId, schema.artists.id))
    .where(arrayContains(schema.artists.genres, ["alternative metal"]))
    .orderBy(desc(schema.scrobbles.timestamp))
    .limit(limit)
    .execute();

  const feed = scrobbles.map(({ scrobbles }) => ({
    scrobble: scrobbles.uri,
    timestamp: scrobbles.timestamp,
  }));

  const { scrobbles: lastScrobble } =
    scrobbles.length > 0 ? scrobbles.at(-1)! : { scrobbles: null };
  const nextCursor = lastScrobble
    ? lastScrobble.timestamp.getTime().toString(10)
    : undefined;

  return {
    cursor: nextCursor,
    feed,
  };
};

export const publisherDid = "did:plc:vegqomyce4ssoqs7zwqvgqty";
export const rkey = "alternative-metal";

export const info = {
  handler,
  needsAuth: false,
  publisherDid,
  rkey,
} as Algorithm;
