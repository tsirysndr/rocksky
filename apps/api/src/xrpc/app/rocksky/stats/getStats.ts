import { consola } from "consola";
import type { Context } from "context";
import { count, eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { StatsView } from "lexicon/types/app/rocksky/stats/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/stats/getStats";
import { transientDbRetry } from "lib/dbRetry";
import { readStats, writeStats } from "lib/statsCache";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const pending = new Map<string, Promise<StatsView>>();
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
      let work = pending.get(params.did);
      if (!work) {
        work = Effect.runPromise(getStats(params)).finally(() =>
          pending.delete(params.did),
        );
        pending.set(params.did, work);
      }
      const result = await work;
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
      const cached = await readStats(ctx, params.did);
      if (cached) return { data: cached };

      // Resolve the actor inside each aggregate, avoiding a separate round trip.
      const userId = ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .limit(1);

      // One pass, not four. Every count here scans the same slice of
      // `scrobbles`, and issuing them as separate queries meant four pool slots
      // and four multi-second index scans per profile card — which is what
      // exhausted the pool and left these queries to be cancelled by the
      // replica's recovery conflicts.
      const [countsRow, lovedRow] = await Promise.all([
        ctx.readDb
          .select({
            scrobbles: count(),
            artists: sql<number>`count(distinct ${tables.scrobbles.artistId})`,
            albums: sql<number>`count(distinct ${tables.scrobbles.albumId})`,
            tracks: sql<number>`count(distinct ${tables.scrobbles.trackId})`,
          })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.userId, userId))
          .execute(),
        ctx.db
          .select({ n: count() })
          .from(tables.lovedTracks)
          .where(eq(tables.lovedTracks.userId, userId))
          .execute(),
      ]);

      const counts = countsRow[0];
      const data = {
        scrobbles: Number(counts?.scrobbles ?? 0),
        artists: Number(counts?.artists ?? 0),
        loved_tracks: Number(lovedRow[0]?.n ?? 0),
        albums: Number(counts?.albums ?? 0),
        tracks: Number(counts?.tracks ?? 0),
      };

      await writeStats(ctx, params.did, data);

      return { data };
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
