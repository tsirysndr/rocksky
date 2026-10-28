import { consola } from "consola";
import type { Context } from "context";
import { and, count, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorArtists";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import { deepCamelCaseKeys } from "lib";
import { transientDbRetry } from "lib/dbRetry";
import { queryCache } from "lib/queryCache";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cached = queryCache(
    (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
    "2 minutes",
  );

  const getActorArtists = (params: QueryParams) =>
    pipe(
      cached(params),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );

  server.app.rocksky.actor.getActorArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorArtists(params));
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
}): Effect.Effect<{ data: Artist[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 10;
      const offset = params.offset ?? 0;

      const userId = ctx.readDb
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .limit(1);

      const dateConditions = [];
      if (params.startDate) {
        dateConditions.push(
          gte(tables.scrobbles.timestamp, new Date(params.startDate)),
        );
      }
      if (params.endDate) {
        dateConditions.push(
          lte(tables.scrobbles.timestamp, new Date(params.endDate)),
        );
      }

      // Count from the covering index before joining artist metadata.
      const artistCounts = ctx.readDb
        .select({
          artistId: tables.scrobbles.artistId,
          play_count: count().as("play_count"),
        })
        .from(tables.scrobbles)
        .where(and(eq(tables.scrobbles.userId, userId), ...dateConditions))
        .groupBy(tables.scrobbles.artistId)
        .as("artist_counts");
      const topArtistsQuery = ctx.readDb
        .select({
          artistId: artistCounts.artistId,
          play_count: artistCounts.play_count,
        })
        .from(artistCounts)
        .innerJoin(tables.artists, eq(artistCounts.artistId, tables.artists.id))
        .where(ne(tables.artists.name, "Various Artists"))
        .orderBy(desc(artistCounts.play_count), artistCounts.artistId)
        .limit(limit)
        .offset(offset)
        .as("top_artists");

      const listeners = ctx.readDb
        .select({
          count: sql<number>`count(distinct ${tables.scrobbles.userId})`,
        })
        .from(tables.scrobbles)
        .where(
          and(
            eq(tables.scrobbles.artistId, tables.artists.id),
            ...dateConditions,
          ),
        );
      const rows = await ctx.readDb
        .select({
          id: tables.artists.id,
          name: tables.artists.name,
          picture: tables.artists.picture,
          sha256: tables.artists.sha256,
          uri: tables.artists.uri,
          genres: tables.artists.genres,
          play_count: topArtistsQuery.play_count,
          unique_listeners: sql<number>`(${listeners})`.mapWith(Number),
        })
        .from(tables.artists)
        .innerJoin(
          topArtistsQuery,
          eq(tables.artists.id, topArtistsQuery.artistId),
        )
        .orderBy(desc(topArtistsQuery.play_count), tables.artists.id)
        .execute();
      const data: Artist[] = rows.map(({ genres, ...row }) => ({
        ...row,
        tags: genres || [],
      }));

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve artists: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Artist[];
}): Effect.Effect<{ artists: ArtistViewBasic[] }, never> => {
  return Effect.sync(() => ({ artists: deepCamelCaseKeys(data) }));
};

type Artist = {
  id: string;
  name: string;
  picture: string | null;
  play_count: number;
  sha256: string;
  unique_listeners: number;
  uri: string | null;
  tags: string[];
};
