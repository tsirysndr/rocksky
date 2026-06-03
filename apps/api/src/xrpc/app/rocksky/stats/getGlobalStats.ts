import type { Context } from "context";
import { count } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { GlobalStatsView } from "lexicon/types/app/rocksky/stats/defs";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getGlobalStats = () =>
    pipe(
      { ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll(() => Effect.succeed(defaultStats)),
    );
  server.app.rocksky.stats.getGlobalStats({
    handler: async () => {
      const result = await Effect.runPromise(getGlobalStats());
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  ctx,
}: {
  ctx: Context;
}): Effect.Effect<
  {
    data: {
      scrobbles: number;
      users: number;
      artists: number;
      albums: number;
      tracks: number;
    };
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () => {
      const [scrobblesRow, usersRow, artistsRow, albumsRow, tracksRow] =
        await Promise.all([
          ctx.db.select({ n: count() }).from(tables.scrobbles).execute(),
          ctx.db.select({ n: count() }).from(tables.users).execute(),
          ctx.db.select({ n: count() }).from(tables.artists).execute(),
          ctx.db.select({ n: count() }).from(tables.albums).execute(),
          ctx.db.select({ n: count() }).from(tables.tracks).execute(),
        ]);

      return {
        data: {
          scrobbles: Number(scrobblesRow[0]?.n ?? 0),
          users: Number(usersRow[0]?.n ?? 0),
          artists: Number(artistsRow[0]?.n ?? 0),
          albums: Number(albumsRow[0]?.n ?? 0),
          tracks: Number(tracksRow[0]?.n ?? 0),
        },
      };
    },
    catch: (error) => new Error(`Failed to retrieve global stats ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: {
    scrobbles: number;
    users: number;
    artists: number;
    albums: number;
    tracks: number;
  };
}): Effect.Effect<GlobalStatsView, never> => {
  return Effect.sync(() => ({
    scrobbles: data.scrobbles,
    users: data.users,
    artists: data.artists,
    albums: data.albums,
    tracks: data.tracks,
  }));
};

const defaultStats: GlobalStatsView = {
  scrobbles: 0,
  users: 0,
  artists: 0,
  albums: 0,
  tracks: 0,
};
