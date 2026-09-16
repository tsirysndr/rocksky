import { consola } from "consola";
import type { Context } from "context";
import { count, eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { StatsView } from "lexicon/types/app/rocksky/stats/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/stats/getStats";
import { transientDbRetry } from "lib/dbRetry";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getStats = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry(transientDbRetry),
      Effect.timeout("120 seconds"),
      // Deliberately no fallback. Returning zeros here is indistinguishable
      // from a genuinely empty profile, and both web clients read zero
      // scrobbles on your own profile as "new user" and show the onboarding
      // flow. Failing lets the client keep its last good value instead of
      // telling an established listener they have never scrobbled.
      Effect.tapError((err) =>
        Effect.sync(() => consola.error("Failed to retrieve stats:", err)),
      ),
    );
  server.app.rocksky.stats.getStats({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getStats(params));
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
  {
    data: {
      scrobbles: number;
      artists: number;
      loved_tracks: number;
      albums: number;
      tracks: number;
    };
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () => {
      // Identity, not an aggregate: read it from the primary. On the replica a
      // just-created account has not replicated yet, and "user not found" here
      // returns zeros — which the clients render as the onboarding flow.
      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .execute()
        .then((rows) => rows[0]);

      if (!user) {
        return {
          data: {
            scrobbles: 0,
            artists: 0,
            loved_tracks: 0,
            albums: 0,
            tracks: 0,
          },
        };
      }

      const [scrobblesRow, artistsRow, lovedRow, albumsRow, tracksRow] =
        await Promise.all([
          ctx.readDb
            .select({ n: count() })
            .from(tables.scrobbles)
            .where(eq(tables.scrobbles.userId, user.id))
            .execute(),
          ctx.readDb
            .select({
              n: sql<number>`count(distinct ${tables.scrobbles.artistId})`,
            })
            .from(tables.scrobbles)
            .where(eq(tables.scrobbles.userId, user.id))
            .execute(),
          ctx.db
            .select({ n: count() })
            .from(tables.lovedTracks)
            .where(eq(tables.lovedTracks.userId, user.id))
            .execute(),
          ctx.readDb
            .select({
              n: sql<number>`count(distinct ${tables.scrobbles.albumId})`,
            })
            .from(tables.scrobbles)
            .where(eq(tables.scrobbles.userId, user.id))
            .execute(),
          ctx.readDb
            .select({
              n: sql<number>`count(distinct ${tables.scrobbles.trackId})`,
            })
            .from(tables.scrobbles)
            .where(eq(tables.scrobbles.userId, user.id))
            .execute(),
        ]);

      return {
        data: {
          scrobbles: Number(scrobblesRow[0]?.n ?? 0),
          artists: Number(artistsRow[0]?.n ?? 0),
          loved_tracks: Number(lovedRow[0]?.n ?? 0),
          albums: Number(albumsRow[0]?.n ?? 0),
          tracks: Number(tracksRow[0]?.n ?? 0),
        },
      };
    },
    catch: (error) => new Error(`Failed to retrieve stats ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: {
    scrobbles: number;
    artists: number;
    loved_tracks: number;
    albums: number;
    tracks: number;
  };
}): Effect.Effect<StatsView, never> => {
  return Effect.sync(() => ({
    scrobbles: data.scrobbles,
    artists: data.artists,
    lovedTracks: data.loved_tracks,
    albums: data.albums,
    tracks: data.tracks,
  }));
};
