import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { consola } from "consola";
import { desc, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorScrobbles";
import type { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import { withLikes } from "lib/trackLikes";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getActorScrobbles = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  server.app.rocksky.actor.getActorScrobbles({
    // Optional: authVerifier returns {} without a token, so this stays public —
    // a DID just means `liked` can be filled in.
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getActorScrobbles(params, auth));
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
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<{ data: Scrobble[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;

      const rows = await ctx.db
        .select({
          id: tables.scrobbles.id,
          track_id: tables.scrobbles.trackId,
          title: tables.tracks.title,
          artist: tables.tracks.artist,
          album_artist: tables.tracks.albumArtist,
          album_art: tables.tracks.albumArt,
          album: tables.tracks.album,
          handle: tables.users.handle,
          did: tables.users.did,
          avatar: tables.users.avatar,
          uri: tables.scrobbles.uri,
          track_uri: tables.tracks.uri,
          artist_uri: tables.tracks.artistUri,
          album_uri: tables.tracks.albumUri,
          created_at: tables.scrobbles.timestamp,
          timestamp: tables.scrobbles.timestamp,
        })
        .from(tables.scrobbles)
        .innerJoin(
          tables.tracks,
          eq(tables.scrobbles.trackId, tables.tracks.id),
        )
        .innerJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        // id breaks ties: scrobbles can share a timestamp, and without a
        // unique key OFFSET pages overlap and skip.
        .orderBy(desc(tables.scrobbles.timestamp), desc(tables.scrobbles.id))
        .limit(limit)
        .offset(offset)
        .execute();

      // Keyed on track_id — `id` here is the scrobble, not the song.
      const withLiked = await withLikes(ctx, rows, did, (r) => r.track_id);

      return {
        data: withLiked.map((r) => ({
          ...r,
          created_at: r.created_at.toISOString().replace(/Z$/, ""),
          timestamp: r.timestamp.toISOString(),
        })),
      };
    },
    catch: (error) => new Error(`Failed to retrieve scrobbles: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Scrobble[];
}): Effect.Effect<{ scrobbles: ScrobbleViewBasic[] }, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map((x) => ({
      id: x.id,
      trackId: x.track_id,
      title: x.title,
      artist: x.artist,
      albumArtist: x.album_artist,
      albumArt: x.album_art,
      album: x.album,
      handle: x.handle,
      did: x.did,
      avatar: x.avatar,
      uri: x.uri,
      trackUri: x.track_uri,
      liked: x.liked ?? false,
      artistUri: x.artist_uri,
      albumUri: x.album_uri,
      createdAt: x.timestamp,
    })),
  }));
};

type Scrobble = {
  id: string;
  liked?: boolean;
  track_id: string | null;
  title: string;
  artist: string;
  album_artist: string;
  album_art: string | null;
  album: string;
  handle: string;
  did: string;
  avatar: string;
  uri: string | null;
  track_uri: string | null;
  artist_uri: string | null;
  album_uri: string | null;
  created_at: string;
  timestamp: string;
};
