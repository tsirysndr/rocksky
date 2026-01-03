import { Context } from "../context.ts";
import { Algorithm, feedParams } from "./types.ts";
import schema from "../schema/mod.ts";
import { and, arrayContains, desc, eq, lt } from "drizzle-orm";

const handler = async (
  ctx: Context,
  params: feedParams,
  _did?: string | null,
) => {
  const { limit = 50, cursor } = params;

  const whereConditions = [arrayContains(schema.artists.genres, ["west coast hip hop"])];

  if (cursor) {
    const cursorDate = new Date(parseInt(cursor, 10));
    whereConditions.push(lt(schema.scrobbles.timestamp, cursorDate));
  }

  const scrobbles = await ctx.db
    .select()
    .from(schema.scrobbles)
    .innerJoin(schema.artists, eq(schema.scrobbles.artistId, schema.artists.id))
    .where(and(...whereConditions))
    .orderBy(desc(schema.scrobbles.timestamp))
    .limit(limit)
    .execute();

  const feed = scrobbles.map(({ scrobbles }) => ({ scrobble: scrobbles.uri }));

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
export const rkey = "west-coast-hip-hop";

export const info = {
  handler,
  needsAuth: false,
  publisherDid,
  rkey,
} as Algorithm;
