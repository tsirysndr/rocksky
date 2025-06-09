import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/actor/getActorScrobbles";
import { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getActorScrobbles = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ scrobbles: [] });
      })
    );
  server.app.rocksky.actor.getActorScrobbles({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorScrobbles(params));
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
}): Effect.Effect<{ data: Scrobble[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getScrobbles", {
        user_did: params.did,
        pagination: {
          skip: params.offset,
          take: params.limit,
        },
      }),
    catch: (error) => new Error(`Failed to retrieve artists: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Scrobble[];
}): Effect.Effect<{ scrobbles: ScrobbleViewBasic[] }, never> => {
  return Effect.sync(() => ({ scrobbles: deepCamelCaseKeys(data) }));
};

type Scrobble = {
  id: string;
};
