import type { Context } from "context";
import { consola } from "consola";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobblerViewBasic } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getTopScrobblers";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getTopScrobblers = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
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

      const conditions = [eq(tables.users.isBot, false)];
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

      const rows = await ctx.db
        .select({
          id: tables.users.id,
          did: tables.users.did,
          handle: tables.users.handle,
          display_name: tables.users.displayName,
          avatar: tables.users.avatar,
          scrobbles: count(tables.scrobbles.id).as("scrobbles"),
          unique_artists:
            sql<number>`count(DISTINCT ${tables.scrobbles.artistId})`.as(
              "unique_artists",
            ),
          unique_tracks:
            sql<number>`count(DISTINCT ${tables.scrobbles.trackId})`.as(
              "unique_tracks",
            ),
        })
        .from(tables.scrobbles)
        .innerJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .where(and(...conditions))
        .groupBy(
          tables.users.id,
          tables.users.did,
          tables.users.handle,
          tables.users.displayName,
          tables.users.avatar,
        )
        .orderBy(desc(sql`count(${tables.scrobbles.id})`), tables.users.id)
        .limit(limit)
        .offset(offset)
        .execute();

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
