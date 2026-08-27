import type { Context } from "context";
import { consola } from "consola";
import { desc, eq, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/playlist/getPlaylists";
import {
  compileRsqlFilterParam,
  type RsqlFieldMap,
  rsqlSelectors,
} from "lib/rsql";
import * as R from "ramda";
import tables from "schema";
import type { SelectPlaylist } from "schema/playlists";
import type { SelectUser } from "schema/users";

// `title` and the `curator*` fields are the names the playlistViewBasic output
// uses; they map back onto the columns those view fields are built from.
const PLAYLIST_FIELDS: RsqlFieldMap = {
  name: tables.playlists.name,
  title: tables.playlists.name,
  description: tables.playlists.description,
  uri: tables.playlists.uri,
  spotifyLink: tables.playlists.spotifyLink,
  tidalLink: tables.playlists.tidalLink,
  appleMusicLink: tables.playlists.appleMusicLink,
  createdAt: { column: tables.playlists.createdAt, type: "date" },
  updatedAt: { column: tables.playlists.updatedAt, type: "date" },
  curatorDid: tables.users.did,
  curatorHandle: tables.users.handle,
  curatorName: tables.users.displayName,
};

// `track.*` selectors match against the playlist's contents rather than the
// playlist itself: `track.artist=="Daft Punk"` means "playlists containing a
// track by Daft Punk". Several track predicates in one `;` group have to be
// satisfied by the *same* track, which is what you want from
// `track.artist=="Daft Punk";track.album=="Discovery"`.
const TRACK_FIELDS: RsqlFieldMap = {
  "track.title": tables.tracks.title,
  "track.artist": tables.tracks.artist,
  "track.album": tables.tracks.album,
  "track.albumArtist": tables.tracks.albumArtist,
};

const FILTER_FIELDS: RsqlFieldMap = { ...PLAYLIST_FIELDS, ...TRACK_FIELDS };

const filtersOnTracks = (filter: string | undefined) =>
  rsqlSelectors(filter).some((selector) => selector in TRACK_FIELDS);

export default function (server: Server, ctx: Context) {
  const getPlaylists = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ playlists: [] });
      }),
    );
  server.app.rocksky.playlist.getPlaylists({
    handler: async ({ params }) => {
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const result = await Effect.runPromise(getPlaylists(params));
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
}): Effect.Effect<Playlists, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const projection = {
        playlists: tables.playlists,
        users: tables.users,
        trackCount: sql<number>`
          (SELECT COUNT(*)
            FROM ${tables.playlistTracks}
            WHERE ${tables.playlistTracks.playlistId} = ${tables.playlists.id}
          )`.as("trackCount"),
        // Album art of up to four tracks, for the cover mosaic shown when the
        // playlist has no picture. Grouped by art so one album's tracks don't
        // fill every tile; ordered by first-added so the mosaic is stable.
        trackArts: sql<string[]>`
          (SELECT COALESCE(array_agg(art), '{}')
           FROM (
             SELECT t.album_art AS art
             FROM ${tables.playlistTracks} pt
             JOIN ${tables.tracks} t ON pt.track_id = t.xata_id
             WHERE pt.playlist_id = ${tables.playlists.id}
               AND t.album_art IS NOT NULL
             GROUP BY t.album_art
             ORDER BY MIN(pt.xata_createdat)
             LIMIT 4
           ) arts)`.as("trackArts"),
      };
      const base = (dedupe = false) =>
        (dedupe ? ctx.db.selectDistinct(projection) : ctx.db.select(projection))
          .from(tables.userPlaylists)
          .leftJoin(
            tables.playlists,
            eq(tables.userPlaylists.playlistId, tables.playlists.id),
          )
          .leftJoin(
            tables.users,
            eq(tables.userPlaylists.userId, tables.users.id),
          );

      const where = compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const limit = params.limit || 20;
      const offset = params.offset || 0;

      // Filtering on track fields needs the contents joined in, which fans a
      // playlist out to one row per matching track — DISTINCT folds it back to
      // one row per playlist. The join is skipped entirely when the filter
      // doesn't mention tracks, so the common case pays nothing for it.
      //
      // DISTINCT rather than GROUP BY on the playlist id: Postgres only infers
      // that the other selected columns are functionally dependent when the
      // grouped column is a PRIMARY KEY, and xata_id carries a UNIQUE
      // constraint instead. Grouping therefore raised "column must appear in
      // the GROUP BY clause", which the catchAll below turned into an empty
      // result — so every track filter silently returned nothing.
      if (filtersOnTracks(params.filter)) {
        return base(true)
          .innerJoin(
            tables.playlistTracks,
            eq(tables.playlistTracks.playlistId, tables.playlists.id),
          )
          .innerJoin(
            tables.tracks,
            eq(tables.playlistTracks.trackId, tables.tracks.id),
          )
          .where(where)
          .orderBy(desc(tables.playlists.createdAt))
          .limit(limit)
          .offset(offset)
          .execute();
      }

      const query = base();
      return (where ? query.where(where) : query)
        .orderBy(desc(tables.playlists.createdAt))
        .limit(limit)
        .offset(offset)
        .execute();
    },
    catch: (error) => new Error(`Failed to retrieve playlists: ${error}`),
  });
};

const presentation = (
  data: Playlists,
): Effect.Effect<{ playlists: PlaylistViewBasic[] }, never> => {
  return Effect.sync(() => ({
    playlists: data.map((playlist) => ({
      ...R.omit(["picture", "name"], playlist.playlists),
      title: playlist.playlists.name,
      coverImageUrl: playlist.playlists.picture,
      curatorDId: playlist.users.did,
      curatorName: playlist.users.displayName,
      curatorAvatarUrl: playlist.users.avatar,
      curatorHandle: playlist.users.handle,
      createdAt: playlist.playlists.createdAt.toISOString(),
      updatedAt: playlist.playlists.updatedAt.toISOString(),
      trackCount: playlist.trackCount,
      trackArts: playlist.trackArts ?? [],
    })),
  }));
};

type Playlists = {
  playlists: SelectPlaylist;
  users: SelectUser;
  trackCount: number;
  trackArts: string[] | null;
}[];
