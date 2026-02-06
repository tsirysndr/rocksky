import type { Context } from "context";
import { consola } from "consola";
import { count, countDistinct, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobbleViewDetailed } from "lexicon/types/app/rocksky/scrobble/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobble";
import * as R from "ramda";
import tables from "schema";
import type { SelectAlbum } from "schema/albums";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getScrobble = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("Error retrieving scrobble:", err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.scrobble.getScrobble({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobble(params));
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
}): Effect.Effect<
  [Scrobble | undefined, SelectArtist[], number, number],
  Error
> => {
  return Effect.tryPromise({
    try: async () => {
      const scrobble = await ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .leftJoin(tables.albums, eq(tables.scrobbles.albumId, tables.albums.id))
        .leftJoin(
          tables.artists,
          eq(tables.scrobbles.artistId, tables.artists.id),
        )
        .where(eq(tables.scrobbles.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      const artists = await Promise.all(
        scrobble.tracks.artist.split(",").map((name) =>
          ctx.db
            .select()
            .from(tables.artists)
            .where(eq(tables.artists.name, name.trim()))
            .execute()
            .then(([row]) => row),
        ),
      );

      return Promise.all([
        Promise.resolve(scrobble),
        Promise.resolve(artists.filter((x) => x !== undefined)),
        // count the number of listeners
        ctx.db
          .select({
            count: countDistinct(tables.scrobbles.userId),
          })
          .from(tables.scrobbles)
          .leftJoin(
            tables.tracks,
            eq(tables.tracks.id, tables.scrobbles.trackId),
          )
          .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
          .where(eq(tables.scrobbles.trackId, scrobble?.tracks.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        // count the number of scrobbles
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .leftJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(eq(tables.scrobbles.trackId, scrobble?.tracks.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve scrobble: ${error}`),
  });
};

const presentation = ([
  { scrobbles, tracks, users, albums, artists },
  trackArtists,
  listeners,
  scrobblesCount,
]: [Scrobble | undefined, SelectArtist[], number, number]): Effect.Effect<
  ScrobbleViewDetailed,
  never
> => {
  return Effect.sync(() => ({
    ...R.omit(["albumArt", "id", "albumUri"], tracks),
    artists: trackArtists.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    albumUri: albums.uri,
    cover: tracks.albumArt,
    date: scrobbles.timestamp.toISOString(),
    user: users.handle,
    uri: scrobbles.uri,
    tags: artists?.genres || [],
    listeners,
    scrobbles: scrobblesCount,
    createdAt: scrobbles.createdAt.toISOString(),
    updatedAt: scrobbles.updatedAt.toISOString(),
    id: scrobbles.id,
  }));
};

type Scrobble = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
  albums: SelectAlbum;
  artists: SelectArtist;
};
