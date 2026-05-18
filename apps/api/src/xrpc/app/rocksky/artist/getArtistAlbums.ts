import type { Context } from "context";
import { consola } from "consola";
import { count, eq, inArray, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistAlbums";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(10),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("10 seconds"),
      ),
  });

  const getArtistAlbums = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ albums: [] });
      }),
    );

  server.app.rocksky.artist.getArtistAlbums({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistAlbums(params));
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
      const artist = await ctx.db
        .select({ id: tables.artists.id })
        .from(tables.artists)
        .where(eq(tables.artists.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      if (!artist) return { data: [] };

      const artistAlbumRows = await ctx.db
        .select({ albumId: tables.artistAlbums.albumId })
        .from(tables.artistAlbums)
        .where(eq(tables.artistAlbums.artistId, artist.id))
        .execute();

      if (artistAlbumRows.length === 0) return { data: [] };

      const albumIds = artistAlbumRows
        .map((r) => r.albumId)
        .filter((id): id is string => id !== null);

      const [albums, scrobbleCounts, uniqueListenersRows] = await Promise.all([
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
            play_count: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .where(inArray(tables.scrobbles.albumId, albumIds))
          .groupBy(tables.scrobbles.albumId)
          .execute(),
        ctx.db
          .select({
            albumId: tables.scrobbles.albumId,
            unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
          })
          .from(tables.scrobbles)
          .where(inArray(tables.scrobbles.albumId, albumIds))
          .groupBy(tables.scrobbles.albumId)
          .execute(),
      ]);

      const playCountMap = new Map(
        scrobbleCounts.map((r) => [r.albumId, Number(r.play_count)]),
      );
      const listenersMap = new Map(
        uniqueListenersRows.map((r) => [r.albumId, Number(r.unique_listeners)]),
      );

      const data: Album[] = albums.map((album) => ({
        id: album.id,
        uri: album.uri,
        title: album.title,
        artist: album.artist,
        artist_uri: album.artistUri,
        year: album.year,
        album_art: album.albumArt,
        release_date: album.releaseDate,
        sha256: album.sha256,
        play_count: playCountMap.get(album.id) ?? 0,
        unique_listeners: listenersMap.get(album.id) ?? 0,
      }));

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve artist's albums: ${error}`),
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
