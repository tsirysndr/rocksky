import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { StatsView } from "lexicon/types/app/rocksky/stats/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/stats/getStats";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getStats = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll(() => Effect.succeed(defaultStats)),
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
}): Effect.Effect<Stats | undefined, Error> => {
  return Effect.tryPromise({
    try: () => ctx.analytics.post("library.getStats", { user_did: params.did }),
    catch: (error) => new Error(`Failed to retrieve stats ${error}`),
  });
};

const presentation = ({ data }: Stats): Effect.Effect<StatsView, never> => {
  return Effect.sync(() => deepCamelCaseKeys(data));
};

type Stats = {
  data: {
    scrobbles: number;
    artists: number;
    loved_tracks: number;
    albums: number;
    tracks: number;
  };
};

const defaultStats: StatsView = {
  scrobbles: 0,
  artists: 0,
  lovedTracks: 0,
  albums: 0,
  tracks: 0,
};
