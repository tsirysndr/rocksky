import type { Context } from "context";
import { consola } from "consola";
import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorAlbums";
import type { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(2),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getActorAlbums = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ albums: [] });
      }),
    );

  server.app.rocksky.actor.getActorAlbums({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorAlbums(params));
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
}): Effect.Effect<{ data: Album[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 10;
      const offset = params.offset ?? 0;

      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(or(eq(tables.users.did, params.did), eq(tables.users.handle, params.did)))
        .execute()
        .then((rows) => rows[0]);

      if (!user) return { data: [] };

      const dateConditions = [];
      if (params.startDate) {
        dateConditions.push(gte(tables.scrobbles.timestamp, new Date(params.startDate)));
      }
      if (params.endDate) {
        dateConditions.push(lte(tables.scrobbles.timestamp, new Date(params.endDate)));
      }

      const topAlbumsQuery = await ctx.db
        .select({
          albumId: tables.scrobbles.albumId,
          play_count: count(tables.scrobbles.id).as("play_count"),
        })
        .from(tables.scrobbles)
        .where(
          and(eq(tables.scrobbles.userId, user.id), ...(dateConditions.length > 0 ? dateConditions : [])),
        )
        .groupBy(tables.scrobbles.albumId)
        .orderBy(desc(sql`count(${tables.scrobbles.id})`))
        .limit(limit)
        .offset(offset)
        .execute();

      if (topAlbumsQuery.length === 0) return { data: [] };

      const albumIds = topAlbumsQuery.map((a) => a.albumId).filter((id): id is string => id !== null);

      const [albums, uniqueListenersRows] = await Promise.all([
        ctx.db
          .select({
            id: tables.albums.id,
            uri: tables.albums.uri,
            title: tables.albums.title,
            artist: tables.albums.artist,
            artistUri: tables.albums.artistUri,
            year: tables.albums.year,
            albumArt: tables.albums.albumArt,
            releaseDate: tables.albums.releaseDate,
            sha256: tables.albums.sha256,
          })
          .from(tables.albums)
          .where(inArray(tables.albums.id, albumIds))
          .execute(),
        ctx.db
          .select({
            albumId: tables.scrobbles.albumId,
            unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
          })
          .from(tables.scrobbles)
          .where(
            and(
              inArray(tables.scrobbles.albumId, albumIds),
              ...(dateConditions.length > 0 ? dateConditions : []),
            ),
          )
          .groupBy(tables.scrobbles.albumId)
          .execute(),
      ]);

      const albumMap = new Map(albums.map((a) => [a.id, a]));
      const listenersMap = new Map(uniqueListenersRows.map((r) => [r.albumId, Number(r.unique_listeners)]));
      const playCountMap = new Map(topAlbumsQuery.map((r) => [r.albumId, Number(r.play_count)]));

      const data: Album[] = topAlbumsQuery
        .map((item) => {
          const album = albumMap.get(item.albumId!);
          if (!album) return null;
          return {
            id: album.id,
            uri: album.uri,
            title: album.title,
            artist: album.artist,
            artist_uri: album.artistUri,
            year: album.year,
            album_art: album.albumArt,
            release_date: album.releaseDate,
            sha256: album.sha256,
            play_count: playCountMap.get(item.albumId!) ?? 0,
            unique_listeners: listenersMap.get(item.albumId!) ?? 0,
          };
        })
        .filter((a): a is Album => a !== null);

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve albums: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Album[];
}): Effect.Effect<{ albums: AlbumViewBasic[] }, never> => {
  return Effect.sync(() => ({ albums: deepCamelCaseKeys(data) }));
};

type Album = {
  id: string;
  uri: string | null;
  title: string;
  artist: string;
  artist_uri: string | null;
  year: number | null;
  album_art: string | null;
  release_date: string | null;
  sha256: string;
  play_count: number;
  unique_listeners: number;
};
