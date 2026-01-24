import type { Context } from "context";
import { consola } from "consola";
import { eq } from "drizzle-orm";
import { Effect, Match, pipe, Cache, Duration } from "effect";
import type { Server } from "lexicon";
import type { ChartsView } from "lexicon/types/app/rocksky/charts/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getScrobblesChart";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getScrobblesCache = Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(30),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getScrobblesChart = (params) =>
    pipe(
      getScrobblesCache,
      Effect.flatMap((cache) => cache.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  server.app.rocksky.charts.getScrobblesChart({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobblesChart(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {
      const match = Match.type<QueryParams>().pipe(
        Match.when({ did: (did) => !!did }, ({ did }) =>
          ctx.analytics.post("library.getScrobblesPerDay", {
            user_did: did,
          }),
        ),
        Match.when({ artisturi: (uri) => !!uri }, ({ artisturi }) =>
          ctx.analytics.post("library.getArtistScrobbles", {
            artist_id: artisturi,
          }),
        ),
        Match.when({ albumuri: (uri) => !!uri }, ({ albumuri }) =>
          ctx.analytics.post("library.getAlbumScrobbles", {
            album_id: albumuri,
          }),
        ),
        Match.when(
          { songuri: (uri) => !!uri && uri.includes("app.rocksky.scrobble") },
          ({ songuri }) =>
            ctx.db
              .select()
              .from(tables.scrobbles)
              .leftJoin(
                tables.tracks,
                eq(tables.scrobbles.trackId, tables.tracks.id),
              )
              .where(eq(tables.scrobbles.uri, songuri))
              .execute()
              .then(([row]) => row?.tracks?.uri)
              .then((uri) =>
                ctx.analytics.post("library.getTrackScrobbles", {
                  track_id: uri,
                }),
              ),
        ),
        Match.when(
          { songuri: (uri) => !!uri && !uri.includes("app.rocksky.scrobble") },
          ({ songuri }) =>
            ctx.analytics.post("library.getTrackScrobbles", {
              track_id: songuri,
            }),
        ),
        Match.when({ genre: (genre) => !!genre }, ({ genre }) =>
          ctx.analytics.post("library.getScrobblesPerDay", {
            genre,
          }),
        ),
        Match.orElse(() =>
          ctx.analytics.post("library.getScrobblesPerDay", {}),
        ),
      );

      return match(params);
    },
    catch: (error) => new Error(`Failed to retrieve scrobbles chart: ${error}`),
  });
};

const presentation = ({ data }): Effect.Effect<ChartsView, never> => {
  return Effect.sync(() => ({
    scrobbles: data,
  }));
};
