import type { Context } from "context";
import { consola } from "consola";
import { and, asc, eq, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { PlaylistViewDetailed } from "lexicon/types/app/rocksky/playlist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/playlist/getPlaylist";
import { compileRsqlFilterParam, type RsqlFieldMap } from "lib/rsql";
import * as R from "ramda";
import tables from "schema";

// Filters the playlist's tracks, not the playlist itself — the playlist is
// already addressed by `uri`.
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
  addedAt: { column: tables.playlistTracks.addedAt, type: "date" },
};
import type { SelectPlaylist } from "schema/playlists";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getPlaylist = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.playlist.getPlaylist({
    handler: async ({ params }) => {
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
      const result = await Effect.runPromise(getPlaylist(params));
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
}): Effect.Effect<[Playlist, SelectTrack[]], Error> => {
  return Effect.tryPromise({
    try: async () => {
      // Clients build the URI from whatever identifies the actor in the route,
      // which is often a handle — `at://alice.example/...` never matches the
      // stored `at://did:plc:.../...`. Canonicalise to the owner's DID first.
      const uri = await canonicalUri(ctx, params.uri);
      const [playlist, tracks] = await Promise.all([
        ctx.db
          .select({
            playlists: tables.playlists,
            users: tables.users,
            trackCount: sql<number>`
              (SELECT COUNT(*)
                FROM ${tables.playlistTracks}
                WHERE ${tables.playlistTracks.playlistId} = ${tables.playlists.id}
              )`.as("trackCount"),
          })
          .from(tables.userPlaylists)
          .leftJoin(
            tables.playlists,
            eq(tables.userPlaylists.playlistId, tables.playlists.id),
          )
          .leftJoin(
            tables.users,
            eq(tables.userPlaylists.userId, tables.users.id),
          )
          .where(eq(tables.playlists.uri, uri))
          .execute()
          .then(([row]) => row),
        ctx.db
          .select()
          .from(tables.playlistTracks)
          .leftJoin(
            tables.tracks,
            eq(tables.playlistTracks.trackId, tables.tracks.id),
          )
          .leftJoin(
            tables.playlists,
            eq(tables.playlistTracks.playlistId, tables.playlists.id),
          )
          .where(
            and(
              eq(tables.playlists.uri, uri),
              compileRsqlFilterParam(params.filter, FILTER_FIELDS),
            ),
          )
          // addedAt is the record's own timestamp and is what the playlist is
          // ordered by; createdAt only says when we ingested the commit, which
          // can differ when entries arrive out of order or get backfilled.
          .orderBy(
            asc(tables.playlistTracks.addedAt),
            asc(tables.playlistTracks.createdAt),
          )
          .execute()
          .then((rows) => rows.map((row) => row.tracks)),
      ]);

      // presentation() reads playlist.playlists.* inside an Effect.sync, so a
      // miss would throw there as a defect — which catchAll does not catch, and
      // the request 500s. Fail here instead, as a typed error catchAll handles.
      if (!playlist?.playlists) {
        throw new Error(`Playlist not found: ${uri}`);
      }
      return [playlist, tracks] as [Playlist, SelectTrack[]];
    },
    catch: (error) => new Error(`Failed to retrieve playlist: ${error}`),
  });
};

// Rewrites at://<handle>/... to at://<did>/... when the authority is a handle
// we know. Returns the input untouched when it is already a DID or unknown.
const canonicalUri = async (ctx: Context, uri: string): Promise<string> => {
  const [authority, collection, rkey] = uri.replace(/^at:\/\//, "").split("/");
  if (!authority || authority.startsWith("did:") || !rkey) {
    return uri;
  }
  const user = await ctx.db
    .select({ did: tables.users.did })
    .from(tables.users)
    .where(eq(tables.users.handle, authority))
    .limit(1)
    .then((rows) => rows[0]);
  return user ? `at://${user.did}/${collection}/${rkey}` : uri;
};

const presentation = ([playlist, tracks]: [
  Playlist,
  SelectTrack[],
]): Effect.Effect<PlaylistViewDetailed, never> => {
  return Effect.sync(() => ({
    ...R.omit(["name", "picture"], playlist.playlists),
    tracks: tracks.map((track) => ({
      ...R.omit(["lyrics"], track),
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
    })),
    title: playlist.playlists.name,
    coverImageUrl: playlist.playlists.picture,
    curatorDId: playlist.users.did,
    curatorName: playlist.users.displayName,
    curatorAvatarUrl: playlist.users.avatar,
    curatorHandle: playlist.users.handle,
    createdAt: playlist.playlists.createdAt.toISOString(),
    updatedAt: playlist.playlists.updatedAt.toISOString(),
    trackCount: playlist.trackCount,
  }));
};

type Playlist = {
  playlists: SelectPlaylist;
  users: SelectUser;
  trackCount: number;
};
