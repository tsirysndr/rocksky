import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorNeighbours";
import type { NeighbourViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import { deepCamelCaseKeys } from "lib";
import users from "schema/users";
import { eq, or } from "drizzle-orm";

export default function (server: Server, ctx: Context) {
  const getActorNeighbours = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ neighbours: [] });
      }),
    );
  server.app.rocksky.actor.getActorNeighbours({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorNeighbours(params));
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
}): Effect.Effect<{ data: Neighbour[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const user = await ctx.db
        .select()
        .from(users)
        .where(or(eq(users.did, params.did), eq(users.handle, params.did)))
        .execute()
        .then((rows) => rows[0]);

      if (!user) {
        throw new Error(`User not found`);
      }

      return ctx.analytics.post("library.getNeighbours", {
        user_id: user.id,
      });
    },
    catch: (error) => new Error(`Failed to retrieve neighbours: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Neighbour[];
}): Effect.Effect<{ neighbours: NeighbourViewBasic[] }, never> => {
  return Effect.sync(() => ({ neighbours: deepCamelCaseKeys(data) }));
};

type Neighbour = {
  id: string;
  avatar: string;
  did: string;
  displayName: string;
  handle: string;
  sharedArtistsCount: number;
  similarityScore: number;
  topSharedArtistNames: string[];
  topSharedArtistsDetails: {
    id: string;
    name: string;
    picture: string;
    uri: string;
  }[];
  userId: string;
};
