import { sql } from "drizzle-orm";
import { Context } from "../context.ts";
import schema from "../schema/mod.ts";
import { Algorithm, feedParams, FeedResponse } from "./types.ts";

export const publisherDid = "did:plc:vegqomyce4ssoqs7zwqvgqty";

// db.execute bypasses drizzle's column mapping, so timestamps come back as
// driver strings; asking Postgres for epoch milliseconds keeps the cursor
// byte-identical to the one the ORM path produced.
type ScrobbleRow = {
  uri: string;
  timestampMs: number;
};

// Every genre feed used to be `scrobbles JOIN artists WHERE genres @> ARRAY[x]
// ORDER BY timestamp DESC LIMIT n`, which the planner reads as "walk scrobbles
// newest-first and check each one's artist" — fine for a genre that scrobbles
// constantly, ruinous for a thin one. The afrobeats feed scanned 303k rows and
// took 11.1s to find 30.
//
// Resolving the artists first (GIN on artists.genres) and pulling each one's
// newest rows through (artist_id, timestamp DESC) makes the work proportional
// to the genre instead of to the table: the same feed returns in 38ms. The
// inner LIMIT is what keeps it bounded — a genre's whole history never has to
// be sorted to produce one page.
export async function genreFeed(
  ctx: Context,
  genre: string,
  params: feedParams,
): Promise<FeedResponse> {
  const { limit = 50, cursor } = params;
  const cursorMs = cursor ? parseInt(cursor, 10) : NaN;
  const cursorFilter = Number.isFinite(cursorMs)
    ? sql`and recent.timestamp < to_timestamp(${cursorMs}::double precision / 1000)`
    : sql``;

  const { rows }: { rows: ScrobbleRow[] } = await ctx.db.execute<ScrobbleRow>(
    sql`
    select
      newest.uri,
      (extract(epoch from newest.timestamp) * 1000)::double precision as "timestampMs"
    from ${schema.artists} artist
    cross join lateral (
      select recent.uri, recent.timestamp
      from ${schema.scrobbles} recent
      where recent.artist_id = artist.xata_id
        and recent.uri is not null
        ${cursorFilter}
      order by recent.timestamp desc
      limit ${limit}
    ) newest
    where artist.genres @> array[${genre}]::text[]
    order by newest.timestamp desc
    limit ${limit}
  `,
  );

  const feed = rows.map(({ uri }) => ({ scrobble: uri }));

  const lastScrobble = rows.length > 0 ? rows.at(-1)! : null;
  const nextCursor = lastScrobble
    ? Math.trunc(Number(lastScrobble.timestampMs)).toString(10)
    : undefined;

  return {
    cursor: nextCursor,
    feed,
  };
}

export function genreAlgorithm(genre: string, rkey: string): Algorithm {
  return {
    handler: (ctx, params) => genreFeed(ctx, genre, params),
    needsAuth: false,
    publisherDid,
    rkey,
  };
}
