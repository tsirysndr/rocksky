import type { Context } from "context";
import { consola } from "consola";
import tables from "schema";

const versionKey = (feedUri: string) => `feed:ver:${feedUri}`;
const scrobblesVersionKey = "scrobbles:ver";

export async function getFeedVersion(
  ctx: Context,
  feedUri: string,
): Promise<number> {
  try {
    const v = await ctx.redis.get(versionKey(feedUri));
    return v ? Number.parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function getScrobblesVersion(ctx: Context): Promise<number> {
  try {
    const v = await ctx.redis.get(scrobblesVersionKey);
    return v ? Number.parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function bumpScrobblesVersion(ctx: Context): Promise<void> {
  try {
    await ctx.redis.incr(scrobblesVersionKey);
  } catch (err) {
    consola.warn("bumpScrobblesVersion failed:", err);
  }
}

export async function bumpAllFeedVersions(ctx: Context): Promise<void> {
  try {
    const feeds = await ctx.db
      .select({ uri: tables.feeds.uri })
      .from(tables.feeds)
      .execute();
    if (feeds.length === 0) return;
    await Promise.all(feeds.map((f) => ctx.redis.incr(versionKey(f.uri))));
  } catch (err) {
    consola.warn("bumpAllFeedVersions failed:", err);
  }
}
