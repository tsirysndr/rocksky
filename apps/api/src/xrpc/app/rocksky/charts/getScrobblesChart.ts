import type { Context } from "context";
import { consola } from "consola";
import { and, between, count, eq, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ChartsView } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getScrobblesChart";
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
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getScrobblesChart = (params: QueryParams) =>
    pipe(
      getScrobblesCache,
      Effect.flatMap((cache) => cache.get(params)),
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
  ctx.db
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
  return Effect.tryPromise({
    try: async () => {
      const { from, to } = defaultDateRange(params);

      if (params.did) {
        const user = await ctx.db
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
        const artist = await ctx.db
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
        const album = await ctx.db
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
          trackId = await ctx.db
            .select({ trackId: tables.scrobbles.trackId })
            .from(tables.scrobbles)
            .where(eq(tables.scrobbles.uri, params.songuri))
            .execute()
            .then((rows) => rows[0]?.trackId);
        } else {
          trackId = await ctx.db
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
        const data = await ctx.db
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

      const data = await scrobblesPerDay(ctx, undefined, from, to);
      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve scrobbles chart: ${error}`),
  });
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
