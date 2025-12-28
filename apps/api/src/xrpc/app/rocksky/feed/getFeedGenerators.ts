import { Server } from "lexicon";
import { Context } from "context";
import { Effect, pipe } from "effect";
import type { FeedGeneratorsView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getFeedGenerators";
import tables from "schema";
import { SelectFeed } from "schema/feeds";
import { eq } from "drizzle-orm";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getFeedGenerators = (params) =>
    pipe({ params, ctx }, retrieve, Effect.flatMap(presentation));
  server.app.rocksky.feed.getFeedGenerators({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getFeedGenerators(params));
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
      ctx.db
        .select()
        .from(tables.feeds)
        .leftJoin(tables.users, eq(tables.feeds.userId, tables.users.id))
        .limit(params.size || 100)
        .execute(),
    catch: (error) => Effect.fail(error),
  });
};

const presentation = (
  data: { users: SelectUser; feeds: SelectFeed }[],
): Effect.Effect<FeedGeneratorsView, never> => {
  return Effect.sync(() => ({
    feeds: data.map(({ users, feeds }) => ({
      id: feeds.id,
      name: feeds.displayName,
      description: feeds.description,
      avatar: feeds.avatar,
      did: feeds.did,
      uri: feeds.uri,
      creator: {
        id: users.id,
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })),
  }));
};
