import type { Context } from "context";
import { consola } from "consola";
import { count, desc, sql, and, gte, lte } from "drizzle-orm";
import { Effect, pipe, Cache, Duration } from "effect";
import type { Server } from "lexicon";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getTopArtists";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getTopArtistsCache = Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(5),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getTopArtists = (params: QueryParams) =>
    pipe(
      getTopArtistsCache,
      Effect.flatMap((cache) => cache.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );

  server.app.rocksky.charts.getTopArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTopArtists(params));
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
}): Effect.Effect<{ data: TopArtist[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit || 50;
      const offset = params.offset || 0;

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

      const topArtistsQuery = ctx.db
        .select({
          artistId: tables.scrobbles.artistId,
          scrobbles: count(tables.scrobbles.id).as("scrobbles"),
        })
        .from(tables.scrobbles)
        .where(dateConditions.length > 0 ? and(...dateConditions) : undefined)
        .groupBy(tables.scrobbles.artistId)
        .orderBy(desc(sql`count(${tables.scrobbles.id})`))
        .limit(limit)
        .offset(offset);

      const topArtistsData = await topArtistsQuery.execute();

      if (topArtistsData.length === 0) {
        return { data: [] };
      }

      const artistIds = topArtistsData
        .map((a) => a.artistId)
        .filter((id): id is string => id !== null);

      const artists = await ctx.db
        .select({
          id: tables.artists.id,
          name: tables.artists.name,
          picture: tables.artists.picture,
          sha256: tables.artists.sha256,
          uri: tables.artists.uri,
          genres: tables.artists.genres,
        })
        .from(tables.artists)
        .where(sql`${tables.artists.id} = ANY(${artistIds})`)
        .execute();

      const artistMap = new Map(artists.map((artist) => [artist.id, artist]));

      const uniqueListenersQuery = await ctx.db
        .select({
          artistId: tables.scrobbles.artistId,
          uniqueListeners:
            sql<number>`count(DISTINCT ${tables.scrobbles.userId})`.as(
              "unique_listeners",
            ),
        })
        .from(tables.scrobbles)
        .where(
          and(
            sql`${tables.scrobbles.artistId} = ANY(${artistIds})`,
            dateConditions.length > 0 ? and(...dateConditions) : undefined,
          ),
        )
        .groupBy(tables.scrobbles.artistId)
        .execute();

      const listenersMap = new Map(
        uniqueListenersQuery.map((item) => [
          item.artistId,
          Number(item.uniqueListeners),
        ]),
      );

      const result: TopArtist[] = topArtistsData
        .map((item) => {
          const artist = artistMap.get(item.artistId!);
          if (!artist) return null;

          return {
            id: artist.id,
            name: artist.name,
            picture: artist.picture,
            sha256: artist.sha256,
            uri: artist.uri,
            play_count: Number(item.scrobbles),
            unique_listeners: listenersMap.get(item.artistId!) || 0,
            tags: artist.genres || [],
          };
        })
        .filter((item): item is TopArtist => item !== null);

      return { data: result };
    },
    catch: (error) => new Error(`Failed to retrieve top artists: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: TopArtist[];
}): Effect.Effect<{ artists: ArtistViewBasic[] }, never> => {
  return Effect.sync(() => ({ artists: deepCamelCaseKeys(data) }));
};

type TopArtist = {
  id: string;
  name: string;
  picture: string | null;
  sha256: string;
  uri: string | null;
  play_count: number;
  unique_listeners: number;
  tags: string[];
};
