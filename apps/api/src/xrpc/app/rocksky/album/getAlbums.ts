import { consola } from "consola";
import type { Context } from "context";
import { count, desc, inArray, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { queryCache } from "lib/queryCache";
import type { Server } from "lexicon";
import type { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/album/getAlbums";
import { deepCamelCaseKeys } from "lib";
import { readQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import { compileRsqlFilterParam, type RsqlFieldMap } from "lib/rsql";
import tables from "schema";

const FILTER_FIELDS: RsqlFieldMap = {
  title: tables.albums.title,
  artist: tables.albums.artist,
  year: { column: tables.albums.year, type: "number" },
  releaseDate: tables.albums.releaseDate,
  sha256: tables.albums.sha256,
  uri: tables.albums.uri,
  artistUri: tables.albums.artistUri,
  createdAt: { column: tables.albums.createdAt, type: "date" },
};

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
    "30 seconds",
    200,
  );

  const getAlbums = (params: QueryParams) =>
    pipe(
      cached(params),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ albums: [] });
      }),
    );

  server.app.rocksky.album.getAlbums({
    handler: async ({ params }) => {
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const result = await Effect.runPromise(getAlbums(params));
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
  return readQuery("Failed to retrieve albums", (db) =>
    retrieveAlbums(db, params),
  );
};

export const retrieveAlbums = async (
  db: Context["readDb"],
  params: QueryParams,
) => {
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const filterWhere = compileRsqlFilterParam(params.filter, FILTER_FIELDS);

  const pageIds = filterWhere
    ? (
        await db
          .select({ id: tables.albums.id })
          .from(tables.albums)
          .where(filterWhere)
          .orderBy(desc(tables.albums.createdAt), tables.albums.id)
          .limit(limit)
          .offset(offset)
          .execute()
      ).map((row) => row.id)
    : undefined;
  if (pageIds?.length === 0) return { data: [] };
  const topAlbumsQb = db
    .select({
      albumId: tables.scrobbles.albumId,
      play_count: count().as("play_count"),
    })
    .from(tables.scrobbles)
    .where(pageIds ? inArray(tables.scrobbles.albumId, pageIds) : undefined);

  const topAlbumsQuery = await topAlbumsQb
    .groupBy(tables.scrobbles.albumId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
    .offset(pageIds ? 0 : offset)
    .execute();

  if (!pageIds && topAlbumsQuery.length === 0) return { data: [] };

  const albumIds =
    pageIds ??
    topAlbumsQuery
      .map((a) => a.albumId)
      .filter((id): id is string => id !== null);

  const [albums, uniqueListenersRows] = await Promise.all([
    db
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
    db
      .select({
        albumId: tables.scrobbles.albumId,
        unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
      })
      .from(tables.scrobbles)
      .where(inArray(tables.scrobbles.albumId, albumIds))
      .groupBy(tables.scrobbles.albumId)
      .execute(),
  ]);

  const albumMap = new Map(albums.map((a) => [a.id, a]));
  const listenersMap = new Map(
    uniqueListenersRows.map((r) => [r.albumId, Number(r.unique_listeners)]),
  );
  const playCountMap = new Map(
    topAlbumsQuery.map((r) => [r.albumId, Number(r.play_count)]),
  );

  const data: Album[] = albumIds
    .map((albumId) => {
      const album = albumMap.get(albumId);
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
        play_count: playCountMap.get(albumId) ?? 0,
        unique_listeners: listenersMap.get(albumId) ?? 0,
      };
    })
    .filter((a): a is Album => a !== null);

  return { data };
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
