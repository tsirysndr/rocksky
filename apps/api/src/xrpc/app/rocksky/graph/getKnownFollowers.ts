import type { Context } from "context";
import { eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getKnownFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getKnownFollowers = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [] as ProfileViewBasic[],
        });
      }),
    );
  server.app.rocksky.graph.getKnownFollowers({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getKnownFollowers(params));
      return {
        encoding: "application/json",
        body: {
          ...result,
          subject: {} satisfies ProfileViewBasic,
        },
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
}): Effect.Effect<any[], Error> => {
  return Effect.tryPromise({
    try: async () => [],
    catch: (error) =>
      new Error(`Failed to retrieve user known followers: ${error}`),
  });
};

const presentation = (
  followers: any[],
): Effect.Effect<
  { subject: ProfileViewBasic; followers: ProfileViewBasic[] },
  never
> => {
  return Effect.sync(() => ({
    subject: {} satisfies ProfileViewBasic,
    followers: [],
  }));
};
