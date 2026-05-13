import type { Context } from "context";
import { consola } from "consola";
import { and, count, desc, inArray, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtists";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 50,
    timeToLive: Duration.minutes(5),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("10 seconds"),
      ),
  });

  const getArtists = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );

  server.app.rocksky.artist.getArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtists(params));
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
      const limit = params.limit ?? 100;
      const offset = params.offset ?? 0;
      const names = params.names?.split(",").map((n) => n.trim()).filter(Boolean);

      const filters = [];
      if (names && names.length > 0) {
        filters.push(inArray(tables.artists.name, names));
      }
      if (params.genre) {
        filters.push(sql`${tables.artists.genres} @> ARRAY[${params.genre}]::text[]`);
      }

      let artistIds: string[];

      if (filters.length > 0) {
        const filtered = await ctx.db
          .select({ id: tables.artists.id })
          .from(tables.artists)
          .where(and(...filters))
          .limit(limit)
          .offset(offset)
          .execute();
        artistIds = filtered.map((a) => a.id);
      } else {
        const topArtists = await ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            play_count: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .groupBy(tables.scrobbles.artistId)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(limit)
          .offset(offset)
          .execute();
        artistIds = topArtists.map((a) => a.artistId).filter((id): id is string => id !== null);
      }

      if (artistIds.length === 0) return { data: [] };

      const [artists, scrobbleCounts, uniqueListenersRows] = await Promise.all([
        ctx.db
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
        ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            play_count: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .where(inArray(tables.scrobbles.artistId, artistIds))
          .groupBy(tables.scrobbles.artistId)
          .execute(),
        ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
          })
          .from(tables.scrobbles)
          .where(inArray(tables.scrobbles.artistId, artistIds))
          .groupBy(tables.scrobbles.artistId)
          .execute(),
      ]);

      const playCountMap = new Map(scrobbleCounts.map((r) => [r.artistId, Number(r.play_count)]));
      const listenersMap = new Map(uniqueListenersRows.map((r) => [r.artistId, Number(r.unique_listeners)]));

      const data: Artist[] = artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        picture: artist.picture,
        sha256: artist.sha256,
        uri: artist.uri,
        genres: artist.genres || [],
        play_count: playCountMap.get(artist.id) ?? 0,
        unique_listeners: listenersMap.get(artist.id) ?? 0,
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
  genres: string[];
};
