import { Context } from "context";
import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobbles";
import * as R from "ramda";
import tables from "schema";
import { SelectScrobble } from "schema/scrobbles";
import { SelectTrack } from "schema/tracks";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getScrobbles = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error("Error retrieving scrobbles:", err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  server.app.rocksky.scrobble.getScrobbles({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobbles(params));
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
}): Effect.Effect<Scrobbles | undefined, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .orderBy(desc(tables.scrobbles.timestamp))
        .offset(params.offset || 0)
        .limit(params.limit || 20)
        .execute(),

    catch: (error) => new Error(`Failed to retrieve scrobbles: ${error}`),
  });
};

const presentation = (
  data: Scrobbles,
): Effect.Effect<{ scrobbles: ScrobbleViewBasic[] }, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map(({ scrobbles, tracks, users }) => ({
      ...R.omit(["albumArt", "id", "lyrics"])(tracks),
      cover: tracks.albumArt,
      date: scrobbles.timestamp.toISOString(),
      user: users.handle,
      uri: scrobbles.uri,
      tags: [],
      id: scrobbles.id,
    })),
  }));
};

type Scrobbles = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
}[];
