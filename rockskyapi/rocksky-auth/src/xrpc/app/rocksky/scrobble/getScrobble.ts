import { Context } from "context";
import { count, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ScrobbleViewDetailed } from "lexicon/types/app/rocksky/scrobble/defs";
import { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobble";
import tables from "schema";
import { SelectScrobble } from "schema/scrobbles";
import { SelectTrack } from "schema/tracks";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getScrobble = (params, ctx) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error("Error retrieving scrobble:", err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.scrobble.getScrobble({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobble(params, ctx));
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
}): Effect.Effect<[Scrobble | undefined, number, number], Error> => {
  return Effect.tryPromise({
    try: async () => {
      const scrobble = await ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .where(eq(tables.scrobbles.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);
      return Promise.all([
        Promise.resolve(scrobble),
        // count the number of listeners
        ctx.db
          .select({ count: count() })
          .from(tables.userTracks)
          .leftJoin(
            tables.scrobbles,
            eq(tables.userTracks.trackId, tables.scrobbles.trackId)
          )
          .where(eq(tables.scrobbles.uri, params.uri))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        // count the number of scrobbles
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .leftJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id)
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
  { scrobbles, tracks, users },
  listeners,
  scrobblesCount,
]: [Scrobble | undefined, number, number]): Effect.Effect<
  ScrobbleViewDetailed,
  never
> => {
  return Effect.sync(() => ({
    cover: tracks.albumArt,
    artist: tracks.artist,
    title: tracks.title,
    date: scrobbles.timestamp.toISOString(),
    user: users.handle,
    uri: scrobbles.uri,
    albumUri: tracks.albumUri,
    artistUri: tracks.artistUri,
    tags: [],
    listeners,
    scrobbles: scrobblesCount,
    sha256: tracks.sha256,
    id: scrobbles.id,
  }));
};

type Scrobble = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
};
