import type { Context } from "context";
import { consola } from "consola";
import { and, count, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { DecadeViewBasic } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getDecades";
import tables from "schema";

// Anything outside this is a bad tag rather than a real release date, and one
// stray row would otherwise stretch the axis across centuries.
const FIRST_YEAR = 1900;

export default function (server: Server, ctx: Context) {
  const getDecades = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ decades: [] });
      }),
    );

  server.app.rocksky.charts.getDecades({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getDecades(params));
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
}): Effect.Effect<{ data: Decade[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const conditions = [
        isNotNull(tables.albums.year),
        gte(tables.albums.year, FIRST_YEAR),
        lte(
          tables.albums.year,
          sql<number>`EXTRACT(YEAR FROM CURRENT_DATE)::int`,
        ),
      ];

      if (params.startDate) {
        conditions.push(
          gte(tables.scrobbles.timestamp, new Date(params.startDate)),
        );
      }
      if (params.endDate) {
        conditions.push(
          lte(tables.scrobbles.timestamp, new Date(params.endDate)),
        );
      }

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
        conditions.push(eq(tables.scrobbles.userId, user.id));
      }

      const decade = sql<number>`(${tables.albums.year} / 10) * 10`;

      const rows = await ctx.db
        .select({
          decade: decade.as("decade"),
          scrobbles: count(tables.scrobbles.id).as("scrobbles"),
          uniqueAlbums:
            sql<number>`count(DISTINCT ${tables.scrobbles.albumId})`.as(
              "unique_albums",
            ),
        })
        .from(tables.scrobbles)
        .innerJoin(tables.albums, eq(tables.scrobbles.albumId, tables.albums.id))
        .where(and(...conditions))
        .groupBy(decade)
        .orderBy(decade)
        .execute();

      return {
        data: rows.map((row) => ({
          decade: Number(row.decade),
          scrobbles: Number(row.scrobbles),
          uniqueAlbums: Number(row.uniqueAlbums),
        })),
      };
    },
    catch: (error) => new Error(`Failed to retrieve decades: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Decade[];
}): Effect.Effect<{ decades: DecadeViewBasic[] }, never> => {
  return Effect.sync(() => ({ decades: data }));
};

type Decade = {
  decade: number;
  scrobbles: number;
  uniqueAlbums: number;
};
