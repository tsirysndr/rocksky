import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getFollowers";
import { transientDbRetry } from "lib/dbRetry";
import { graphPage } from "./page";

export default function (server: Server, ctx: Context) {
  const retrieve = (params: QueryParams) =>
    pipe(
      Effect.tryPromise({
        try: async () => {
          const { subject, profiles, cursor, count } = await graphPage(
            ctx,
            params,
            true,
          );
          return { subject, followers: profiles, cursor, count };
        },
        catch: (error) =>
          new Error(`Failed to retrieve user followers: ${error}`),
      }),
      Effect.retry(transientDbRetry),
      Effect.timeout("120 seconds"),
      Effect.catchAll((error) => {
        consola.error(error);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [] as ProfileViewBasic[],
          count: 0,
        });
      }),
    );
  server.app.rocksky.graph.getFollowers({
    handler: async ({ params }) => ({
      encoding: "application/json",
      body: await Effect.runPromise(retrieve(params)),
    }),
  });
}
