import { consola } from "consola";
import type { Context } from "context";
import { type SQL, sql } from "drizzle-orm";
import { Cache, Data, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobblerViewBasic } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getTopScrobblers";
import { deepCamelCaseKeys } from "lib";
import { transientDbRetry } from "lib/dbRetry";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(10),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
  });

  const getTopScrobblers = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(Data.struct({ ...params }))),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ scrobblers: [] });
      }),
    );

  server.app.rocksky.charts.getTopScrobblers({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTopScrobblers(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: TopScrobbler[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit || 20;
      const offset = params.offset || 0;

      const rows =
        params.startDate || params.endDate
          ? await inRange(ctx, params, limit, offset)
          : await allTime(ctx, limit, offset);

      return {
        data: rows.map((row) => ({
          id: row.id,
          did: row.did,
          handle: row.handle,
          display_name: row.display_name,
          avatar: row.avatar,
          scrobbles: Number(row.scrobbles),
          unique_artists: Number(row.unique_artists),
          unique_tracks: Number(row.unique_tracks),
        })),
      };
    },
    catch: (error) => new Error(`Failed to retrieve top scrobblers: ${error}`),
  });
};

// top_scrobblers_mv holds the all-time per-user totals (0026_top_scrobblers_mv.sql),
// refreshed periodically by server.ts.
const allTime = async (ctx: Context, limit: number, offset: number) => {
  const result = await ctx.readDb.execute(sql`
    SELECT
      u.xata_id AS id,
      u.did,
      u.handle,
      u.display_name,
      u.avatar,
      m.scrobbles,
      m.unique_artists,
      m.unique_tracks
    FROM top_scrobblers_mv m
    JOIN users u ON u.xata_id = m.user_id
    WHERE u.is_bot = false
    ORDER BY m.scrobbles DESC, u.xata_id
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return result.rows as TopScrobbler[];
};

const HOUR = 60 * 60 * 1000;

const ceilHour = (d: Date) => new Date(Math.ceil(d.getTime() / HOUR) * HOUR);
const floorHour = (d: Date) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

// user_hour_scrobbles_mv.hour is a UTC wall clock (timestamp without time zone).
const utcHour = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/**
 * Ranged leaderboard, served from user_hour_scrobbles_mv
 * (0030_user_hour_scrobbles_mv.sql).
 *
 * The view holds whole, completed hours, so three legs make up the window: the
 * view for the hours it covers, and live queries for the partial hour at the
 * start, and for everything from the view's coverage to the end of the range —
 * normally the current partial hour, more if a refresh was missed. Reading
 * max(hour) rather than assuming the current hour is what keeps the legs from
 * overlapping (double-counting) or leaving a gap (dropping scrobbles) when the
 * refresh is late.
 *
 * Ranking runs over the counts alone, and only the page that survives LIMIT
 * pays for its distinct artists and tracks.
 */
const inRange = async (
  ctx: Context,
  params: QueryParams,
  limit: number,
  offset: number,
): Promise<TopScrobbler[]> => {
  const start = params.startDate ? new Date(params.startDate) : new Date(0);
  const end = params.endDate ? new Date(params.endDate) : new Date();

  const covered = await ctx.readDb.execute<{ through: string | null }>(sql`
    SELECT to_char(max(hour) + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS through
    FROM user_hour_scrobbles_mv
  `);
  const mvEnd = covered.rows[0]?.through
    ? new Date(covered.rows[0].through).getTime()
    : Number.NEGATIVE_INFINITY;

  // [covStart, covEnd) comes from the view; collapses to empty when the range
  // spans less than an hour or sits entirely past the view's coverage.
  const covStart = ceilHour(start);
  const covEnd = new Date(
    Math.max(covStart.getTime(), Math.min(floorHour(end).getTime(), mvEnd)),
  );
  const covers = covEnd.getTime() > covStart.getTime();

  const head =
    covStart > start
      ? sql`s.timestamp >= ${start.toISOString()}::timestamptz
            AND s.timestamp < ${covStart.toISOString()}::timestamptz
            AND s.timestamp <= ${end.toISOString()}::timestamptz`
      : null;
  const tail =
    covEnd <= end
      ? sql`s.timestamp >= ${covEnd.toISOString()}::timestamptz
            AND s.timestamp <= ${end.toISOString()}::timestamptz`
      : null;
  const inView = sql`m.hour >= ${utcHour(covStart)}::timestamp
                     AND m.hour < ${utcHour(covEnd)}::timestamp`;

  const union = (legs: (SQL | null)[]) =>
    sql.join(
      legs.filter((leg): leg is SQL => leg !== null),
      sql` UNION ALL `,
    );

  const counts = union([
    covers
      ? sql`SELECT m.user_id, m.scrobbles FROM user_hour_scrobbles_mv m WHERE ${inView}`
      : null,
    head ? sql`SELECT s.user_id, 1 FROM scrobbles s WHERE ${head}` : null,
    tail ? sql`SELECT s.user_id, 1 FROM scrobbles s WHERE ${tail}` : null,
  ]);

  // The same three legs per ranked user, as the keys to count distinct.
  const keys = union([
    covers
      ? sql`SELECT z.artist_key, z.track_key
            FROM user_hour_scrobbles_mv m
            CROSS JOIN LATERAL unnest(m.artist_keys, m.track_keys) AS z(artist_key, track_key)
            WHERE m.user_id = t.id AND ${inView}`
      : null,
    head
      ? sql`SELECT hashtext(s.artist_id), hashtext(s.track_id)
            FROM scrobbles s WHERE s.user_id = t.id AND ${head}`
      : null,
    tail
      ? sql`SELECT hashtext(s.artist_id), hashtext(s.track_id)
            FROM scrobbles s WHERE s.user_id = t.id AND ${tail}`
      : null,
  ]);

  const result = await ctx.readDb.execute(sql`
    WITH counts AS (
      SELECT user_id, sum(scrobbles)::bigint AS scrobbles
      FROM (${counts}) legs(user_id, scrobbles)
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ),
    top AS (
      SELECT u.xata_id AS id, u.did, u.handle, u.display_name, u.avatar, c.scrobbles
      FROM counts c
      JOIN users u ON u.xata_id = c.user_id
      WHERE u.is_bot = false
      ORDER BY c.scrobbles DESC, u.xata_id
      LIMIT ${limit}
      OFFSET ${offset}
    )
    SELECT t.id, t.did, t.handle, t.display_name, t.avatar, t.scrobbles,
           uq.unique_artists, uq.unique_tracks
    FROM top t
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT k.artist_key)::int AS unique_artists,
             count(DISTINCT k.track_key)::int AS unique_tracks
      FROM (${keys}) k(artist_key, track_key)
    ) uq ON true
    ORDER BY t.scrobbles DESC, t.id
  `);

  return result.rows as TopScrobbler[];
};

const presentation = ({
  data,
}: {
  data: TopScrobbler[];
}): Effect.Effect<{ scrobblers: ScrobblerViewBasic[] }, never> => {
  return Effect.sync(() => ({ scrobblers: deepCamelCaseKeys(data) }));
};

type TopScrobbler = {
  id: string;
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string;
  scrobbles: number;
  unique_artists: number;
  unique_tracks: number;
};
