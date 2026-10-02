import { consola } from "consola";
import type { Context } from "context";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
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

      const user = await ctx.readDb
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
        .where(and(eq(tables.scrobbles.userId, user.id), ...dateConditions))
        .groupBy(tables.scrobbles.artistId)
        .as("artist_counts");
      const topArtistsQuery = await ctx.readDb
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
        .execute();

      if (topArtistsQuery.length === 0) return { data: [] };

      const artistIds = topArtistsQuery
        .map((a) => a.artistId)
        .filter((id): id is string => id !== null);

      const [artists, uniqueListenersRows] = await Promise.all([
        ctx.readDb
          .select({
            id: tables.artists.id,
            name: tables.artists.name,
            picture: tables.artists.picture,
            sha256: tables.artists.sha256,
            uri: tables.artists.uri,
            genres: tables.artists.genres,
          })
          .from(tables.artists)
          .where(inArray(tables.artists.id, artistIds))
          .execute(),
        ctx.readDb
          .select({
            artistId: tables.scrobbles.artistId,
            unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
          })
          .from(tables.scrobbles)
          .where(
            and(
              inArray(tables.scrobbles.artistId, artistIds),
              ...(dateConditions.length > 0 ? dateConditions : []),
            ),
          )
          .groupBy(tables.scrobbles.artistId)
          .execute(),
      ]);

      const artistMap = new Map(artists.map((a) => [a.id, a]));
      const listenersMap = new Map(
        uniqueListenersRows.map((r) => [
          r.artistId,
          Number(r.unique_listeners),
        ]),
      );
      const playCountMap = new Map(
        topArtistsQuery.map((r) => [r.artistId, Number(r.play_count)]),
      );

      const data: Artist[] = topArtistsQuery
        .map((item) => {
          const artist = artistMap.get(item.artistId!);
          if (!artist) return null;
          return {
            id: artist.id,
            name: artist.name,
            picture: artist.picture,
            sha256: artist.sha256,
            uri: artist.uri,
            play_count: playCountMap.get(item.artistId!) ?? 0,
            unique_listeners: listenersMap.get(item.artistId!) ?? 0,
            tags: artist.genres || [],
          };
        })
        .filter((a): a is Artist => a !== null);

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
