import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { NowPlayingView } from "lexicon/types/app/rocksky/feed/defs";
import { QueryParams } from "lexicon/types/app/rocksky/feed/getNowPlayings";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getNowPlayings = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.feed.getNowPlayings({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getNowPlayings(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getDistinctScrobbles", {
        pagination: {
          skip: 0,
          take: params.size,
        },
      }),
    catch: (error) =>
      new Error(`Failed to retrieve now playing songs: ${error}`),
  });
};

const presentation = (
  data
): Effect.Effect<{ nowPlayings: NowPlayingView[] }, never> => {
  return Effect.sync(() => ({
    nowPlayings: deepCamelCaseKeys(data),
  }));
};
