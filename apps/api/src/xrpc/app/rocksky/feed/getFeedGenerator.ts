import type { Server } from "lexicon";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { FeedGeneratorView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getFeedGenerator";
import tables from "schema";
import type { SelectFeed } from "schema/feeds";
import { eq } from "drizzle-orm";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getFeedGenerator = (params: QueryParams) =>
    pipe({ params, ctx }, retrieve, Effect.flatMap(presentation));
  server.app.rocksky.feed.getFeedGenerator({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getFeedGenerator(params));
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
        .where(eq(tables.feeds.uri, params.feed))
        .execute(),
    catch: (error) => Effect.fail(error),
  });
};

const presentation = (
  data: { users: SelectUser; feeds: SelectFeed }[],
): Effect.Effect<FeedGeneratorView, never> => {
  return Effect.sync(() => ({
    view: data.map(({ users, feeds }) => ({
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
    }))[0],
  }));
};
