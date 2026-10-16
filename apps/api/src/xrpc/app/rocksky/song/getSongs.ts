import { consola } from "consola";
import type { Context } from "context";
import { and, count, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { filteredPage } from "lib/filteredPage";
import { queryCache } from "lib/queryCache";
import type { Server } from "lexicon";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/getSongs";
import { deepCamelCaseKeys } from "lib";
import { readQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import { compileRsqlFilterParam, type RsqlFieldMap } from "lib/rsql";
import tables from "schema";

const FILTER_FIELDS: RsqlFieldMap = {
  title: tables.tracks.title,
  artist: tables.tracks.artist,
  album: tables.tracks.album,
  albumArtist: tables.tracks.albumArtist,
  genre: tables.tracks.genre,
  composer: tables.tracks.composer,
  label: tables.tracks.label,
  duration: { column: tables.tracks.duration, type: "number" },
  trackNumber: { column: tables.tracks.trackNumber, type: "number" },
  discNumber: { column: tables.tracks.discNumber, type: "number" },
  mbId: tables.tracks.mbId,
  isrc: tables.tracks.isrc,
  sha256: tables.tracks.sha256,
  uri: tables.tracks.uri,
  albumUri: tables.tracks.albumUri,
  artistUri: tables.tracks.artistUri,
  createdAt: { column: tables.tracks.createdAt, type: "date" },
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

  const getSongs = (params: QueryParams) =>
    pipe(
      cached(params),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ tracks: [] });
      }),
    );

  server.app.rocksky.song.getSongs({
    handler: async ({ params }) => {
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const result = await Effect.runPromise(getSongs(params));
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
}): Effect.Effect<{ data: Track[] }, Error> => {
  return readQuery("Failed to retrieve tracks", (db) =>
    retrieveSongs(db, params),
  );
};

export const retrieveSongs = async (
  db: Context["readDb"],
  params: QueryParams,
) => {
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const filterWhere = compileRsqlFilterParam(params.filter, FILTER_FIELDS);

  // Direct lookup by mbid/isrc/spotifyId — short-circuits the top-tracks aggregation
  const mbid = params.mbid?.trim();
  const isrc = params.isrc?.trim();
  const spotifyId = params.spotifyId?.trim();
  if (mbid || isrc || spotifyId) {
    const idClauses: SQL[] = [];
    if (mbid) idClauses.push(eq(tables.tracks.mbId, mbid));
    if (isrc) idClauses.push(eq(tables.tracks.isrc, isrc));
    if (spotifyId) {
      idClauses.push(
        eq(
          tables.tracks.spotifyLink,
          `https://open.spotify.com/track/${spotifyId}`,
        ),
      );
    }
    const directWhere = idClauses.length > 1 ? or(...idClauses) : idClauses[0];

    const directTracks = await db
      .select({
        id: tables.tracks.id,
        title: tables.tracks.title,
        artist: tables.tracks.artist,
        albumArtist: tables.tracks.albumArtist,
        albumArt: tables.tracks.albumArt,
        album: tables.tracks.album,
        uri: tables.tracks.uri,
        albumUri: tables.tracks.albumUri,
        artistUri: tables.tracks.artistUri,
        sha256: tables.tracks.sha256,
        mbId: tables.tracks.mbId,
        isrc: tables.tracks.isrc,
        trackNumber: tables.tracks.trackNumber,
        discNumber: tables.tracks.discNumber,
        duration: tables.tracks.duration,
        copyrightMessage: tables.tracks.copyrightMessage,
        createdAt: tables.tracks.createdAt,
      })
      .from(tables.tracks)
      .where(and(directWhere, filterWhere))
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      data: directTracks.map((track) => ({
        id: track.id,
        uri: track.uri,
        title: track.title,
        artist: track.artist,
        artist_uri: track.artistUri,
        album: track.album,
        album_uri: track.albumUri,
        album_art: track.albumArt,
        album_artist: track.albumArtist,
        copyright_message: track.copyrightMessage,
        disc_number: track.discNumber,
        duration: track.duration,
        sha256: track.sha256,
        mbid: track.mbId,
        isrc: track.isrc,
        track_number: track.trackNumber,
        play_count: 0,
        unique_listeners: 0,
        created_at: track.createdAt.toISOString(),
      })),
    };
  }

  // Filter the catalog and page before aggregating history. A broad wildcard
  // must not count every matching track just to display 50 catalog entries.
  const genreWhere = params.genre
    ? sql`EXISTS (SELECT 1 FROM ${tables.artists} WHERE ${tables.artists.name} = ${tables.tracks.albumArtist} AND ${tables.artists.genres} @> ARRAY[${params.genre}]::text[])`
    : undefined;
  const pageIds = filterWhere
    ? await filteredPage(
        db,
        db
          .select({
            id: sql<string>`${tables.tracks.id}`.as("id"),
            created_at: sql`${tables.tracks.createdAt}`.as("created_at"),
          })
          .from(tables.tracks)
          .where(and(filterWhere, genreWhere))
          .getSQL(),
        limit,
        offset,
      )
    : undefined;
  if (pageIds?.length === 0) return { data: [] };

  const topTracksQuery = await db
    .select({
      trackId: tables.scrobbles.trackId,
      play_count: count().as("play_count"),
      unique_listeners:
        sql<number>`count(DISTINCT ${tables.scrobbles.userId})`.as(
          "unique_listeners",
        ),
    })
    .from(tables.scrobbles)
    .innerJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
    .where(pageIds ? inArray(tables.scrobbles.trackId, pageIds) : genreWhere)
    .groupBy(tables.scrobbles.trackId)
    .orderBy(desc(sql`count(DISTINCT ${tables.scrobbles.userId})`))
    .limit(limit)
    .offset(pageIds ? 0 : offset)
    .execute();

  if (!pageIds && topTracksQuery.length === 0) return { data: [] };

  const trackIds =
    pageIds ??
    topTracksQuery
      .map((t) => t.trackId)
      .filter((id): id is string => id !== null);

  const tracks = await db
    .select({
      id: tables.tracks.id,
      title: tables.tracks.title,
      artist: tables.tracks.artist,
      albumArtist: tables.tracks.albumArtist,
      albumArt: tables.tracks.albumArt,
      album: tables.tracks.album,
      uri: tables.tracks.uri,
      albumUri: tables.tracks.albumUri,
      artistUri: tables.tracks.artistUri,
      sha256: tables.tracks.sha256,
      trackNumber: tables.tracks.trackNumber,
      discNumber: tables.tracks.discNumber,
      duration: tables.tracks.duration,
      copyrightMessage: tables.tracks.copyrightMessage,
      createdAt: tables.tracks.createdAt,
    })
    .from(tables.tracks)
    .where(inArray(tables.tracks.id, trackIds))
    .execute();

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const listenersMap = new Map(
    topTracksQuery.map((r) => [r.trackId, Number(r.unique_listeners)]),
  );
  const playCountMap = new Map(
    topTracksQuery.map((r) => [r.trackId, Number(r.play_count)]),
  );

  const data: Track[] = trackIds
    .map((trackId) => {
      const track = trackMap.get(trackId);
      if (!track) return null;
      return {
        id: track.id,
        uri: track.uri,
        title: track.title,
        artist: track.artist,
        artist_uri: track.artistUri,
        album: track.album,
        album_uri: track.albumUri,
        album_art: track.albumArt,
        album_artist: track.albumArtist,
        copyright_message: track.copyrightMessage,
        disc_number: track.discNumber,
        duration: track.duration,
        sha256: track.sha256,
        track_number: track.trackNumber,
        play_count: playCountMap.get(trackId) ?? 0,
        unique_listeners: listenersMap.get(trackId) ?? 0,
        created_at: track.createdAt.toISOString(),
      };
    })
    .filter((t): t is Track => t !== null);

  return { data };
};

const presentation = ({
  data,
}: {
  data: Track[];
}): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({ tracks: deepCamelCaseKeys(data) }));
};

type Track = {
  id: string;
  uri: string | null;
  unique_listeners: number;
  play_count: number;
  title: string;
  artist: string;
  artist_uri: string | null;
  album: string;
  album_uri: string | null;
  album_art: string | null;
  album_artist: string;
  copyright_message: string | null;
  disc_number: number | null;
  duration: number;
  sha256: string;
  mbid?: string | null;
  isrc?: string | null;
  track_number: number | null;
  created_at: string;
};
