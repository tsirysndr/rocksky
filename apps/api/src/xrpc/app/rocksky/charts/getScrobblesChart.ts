import { consola } from "consola";
import type { Context } from "context";
import { and, between, count, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Cache, Data, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ChartsView } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getScrobblesChart";
import { readQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getScrobblesCache = Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(30),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
  });

  const getScrobblesChart = (params: QueryParams) =>
    pipe(
      getScrobblesCache,
      Effect.flatMap((cache) => cache.get(Data.struct({ ...params }))),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );

  server.app.rocksky.charts.getScrobblesChart({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobblesChart(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const defaultDateRange = (params: QueryParams) => {
  const to = params.to ?? new Date().toISOString().slice(0, 10);
  const from =
    params.from ??
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    })();
  return { from, to };
};

const scrobblesPerDay = (
  ctx: Context,
  condition: any,
  from: string,
  to: string,
) =>
  ctx.readDb
    .select({
      date: sql<string>`DATE(${tables.scrobbles.timestamp})`,
      count: count(tables.scrobbles.id),
    })
    .from(tables.scrobbles)
    .where(
      and(
        condition,
        between(sql`DATE(${tables.scrobbles.timestamp})`, from, to),
      ),
    )
    .groupBy(sql`DATE(${tables.scrobbles.timestamp})`)
    .orderBy(sql`DATE(${tables.scrobbles.timestamp})`)
    .execute();

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: Array<{ date: string; count: number }> }, Error> => {
  return readQuery("Failed to retrieve scrobbles chart", async (db) => {
    const { from, to } = defaultDateRange(params);

    if (params.did) {
      const user = await db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .execute()
        .then((rows) => rows[0]);
      if (!user) return { data: [] };
      const data = await scrobblesPerDay(
        ctx,
        eq(tables.scrobbles.userId, user.id),
        from,
        to,
      );
      return { data };
    }

    if (params.artisturi) {
      const artist = await db
        .select({ id: tables.artists.id })
        .from(tables.artists)
        .where(eq(tables.artists.uri, params.artisturi))
        .execute()
        .then((rows) => rows[0]);
      if (!artist) return { data: [] };
      const data = await scrobblesPerDay(
        ctx,
        eq(tables.scrobbles.artistId, artist.id),
        from,
        to,
      );
      return { data };
    }

    if (params.albumuri) {
      const album = await db
        .select({ id: tables.albums.id })
        .from(tables.albums)
        .where(eq(tables.albums.uri, params.albumuri))
        .execute()
        .then((rows) => rows[0]);
      if (!album) return { data: [] };
      const data = await scrobblesPerDay(
        ctx,
        eq(tables.scrobbles.albumId, album.id),
        from,
        to,
      );
      return { data };
    }

    if (params.songuri) {
      let trackId: string | null | undefined;

      if (params.songuri.includes("app.rocksky.scrobble")) {
        trackId = await db
          .select({ trackId: tables.scrobbles.trackId })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.uri, params.songuri))
          .execute()
          .then((rows) => rows[0]?.trackId);
      } else {
        trackId = await db
          .select({ id: tables.tracks.id })
          .from(tables.tracks)
          .where(eq(tables.tracks.uri, params.songuri))
          .execute()
          .then((rows) => rows[0]?.id);
      }

      if (!trackId) return { data: [] };
      const data = await scrobblesPerDay(
        ctx,
        eq(tables.scrobbles.trackId, trackId),
        from,
        to,
      );
      return { data };
    }

    if (params.genre) {
      const data = await db
        .select({
          date: sql<string>`DATE(${tables.scrobbles.timestamp})`,
          count: count(tables.scrobbles.id),
        })
        .from(tables.scrobbles)
        .innerJoin(
          tables.tracks,
          eq(tables.scrobbles.trackId, tables.tracks.id),
        )
        .where(
          and(
            eq(tables.tracks.genre, params.genre),
            between(sql`DATE(${tables.scrobbles.timestamp})`, from, to),
          ),
        )
        .groupBy(sql`DATE(${tables.scrobbles.timestamp})`)
        .orderBy(sql`DATE(${tables.scrobbles.timestamp})`)
        .execute();
      return { data };
    }

    return { data: await globalScrobblesPerDay(db, from, to) };
  });
};

/**
 * Global (unfiltered) series, served from scrobbles_per_day_mv.
 *
 * The view holds completed days only, so the second leg covers whatever it has
 * not caught up on — normally just today, and more if a refresh was missed.
 * Reading max(day) rather than assuming CURRENT_DATE is what keeps the two
 * legs from overlapping (double-counting a day) or leaving a gap (dropping
 * one) when the refresh is late.
 */
const globalScrobblesPerDay = async (
  db: NodePgDatabase,
  from: string,
  to: string,
): Promise<Array<{ date: string; count: number }>> => {
  const result = await db.execute<{ date: string; count: string }>(sql`
    SELECT day::text AS date, count
    FROM scrobbles_per_day_mv
    WHERE day BETWEEN ${from}::date AND ${to}::date

    UNION ALL

    SELECT (s.timestamp)::date::text AS date, count(*)::bigint AS count
    FROM scrobbles s
    WHERE s.timestamp >= COALESCE(
            (SELECT max(day) + 1 FROM scrobbles_per_day_mv)::timestamp,
            '-infinity'::timestamp)
      AND (s.timestamp)::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY (s.timestamp)::date

    ORDER BY 1
  `);

  return result.rows.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }));
};

const presentation = ({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}): Effect.Effect<ChartsView, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
  }));
};
