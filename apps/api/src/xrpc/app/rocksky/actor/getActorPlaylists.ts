import type { Context } from "context";
import { consola } from "consola";
import { and, eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorPlaylists";
import type { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import {
  compileRsqlFilterParam,
  type RsqlFieldMap,
  rsqlSelectors,
} from "lib/rsql";
import tables from "schema";
import type { SelectPlaylist } from "schema/playlists";

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
};

// See getPlaylists: `track.*` selectors match the playlist's contents, so
// `track.artist=="Daft Punk"` returns the actor's playlists containing a track
// by Daft Punk.
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
  const getActorPlaylists = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ playlists: [] });
      }),
    );
  server.app.rocksky.actor.getActorPlaylists({
    handler: async ({ params }) => {
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const result = await Effect.runPromise(getActorPlaylists(params));
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
}): Effect.Effect<Playlist[], Error> => {
  return Effect.tryPromise({
    try: async () => {
      const projection = {
        users: tables.users,
        playlists: tables.playlists,
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
      const where = and(
        or(
          eq(tables.users.did, params.did),
          eq(tables.users.handle, params.did),
        ),
        compileRsqlFilterParam(params.filter, FILTER_FIELDS),
      );
      const base = (dedupe = false) =>
        (dedupe ? ctx.db.selectDistinct(projection) : ctx.db.select(projection))
          .from(tables.playlists)
          .leftJoin(
            tables.users,
            eq(tables.playlists.createdBy, tables.users.id),
          );

      // Joining the contents fans a playlist out to one row per matching
      // track; DISTINCT folds it back. Only done when the filter asks for it.
      // Not GROUP BY on the ids: Postgres only treats the other selected
      // columns as functionally dependent when the grouped column is a PRIMARY
      // KEY, and xata_id is UNIQUE instead — so grouping raised "column must
      // appear in the GROUP BY clause" and the catchAll turned that into an
      // empty list.
      const rows = filtersOnTracks(params.filter)
        ? await base(true)
            .innerJoin(
              tables.playlistTracks,
              eq(tables.playlistTracks.playlistId, tables.playlists.id),
            )
            .innerJoin(
              tables.tracks,
              eq(tables.playlistTracks.trackId, tables.tracks.id),
            )
            .where(where)
            .offset(params.offset)
            .limit(params.limit)
            .execute()
        : await base()
            .where(where)
            .offset(params.offset)
            .limit(params.limit)
            .execute();

      return rows.map((row) => ({
        ...row.playlists,
        trackCount: row.trackCount,
        trackArts: row.trackArts ?? [],
        title: row.playlists.name,
        coverImageUrl: row.playlists.picture,
        curatorDId: row.users.did,
        curatorName: row.users.displayName,
        curatorAvatarUrl: row.users.avatar,
        curatorHandle: row.users.handle,
      }));
    },
    catch: (error) => new Error(`Failed to retrieve user playlists: ${error}`),
  });
};

const presentation = (
  playlists: Playlist[],
): Effect.Effect<{ playlists: PlaylistViewBasic[] }, never> => {
  return Effect.sync(() => ({
    playlists: playlists.map((playlist) => ({
      ...playlist,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    })),
  }));
};

type Playlist = SelectPlaylist & {
  trackCount: number;
  title: string;
  coverImageUrl: string;
  curatorDId: string;
  curatorName: string;
  curatorAvatarUrl: string;
  curatorHandle: string;
};
