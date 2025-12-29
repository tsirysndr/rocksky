import type { Context } from "context";
import { desc, eq, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getFeed";
import type { FeedView } from "lexicon/types/app/rocksky/feed/defs";
import * as R from "ramda";
import tables from "schema";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";
import axios from "axios";

export default function (server: Server, ctx: Context) {
  const getFeed = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(hydrate),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error("Error retrieving scrobbles:", err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  server.app.rocksky.feed.getFeed({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getFeed(params));
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
      const [feed] = await ctx.db
        .select()
        .from(tables.feeds)
        .where(eq(tables.feeds.uri, params.feed))
        .execute();
      if (!feed) {
        throw new Error(`Feed not found`);
      }
      const feedUrl = `https://${feed.did.split("did:web:")[1]}`;
      const response = await axios.get<{
        cusrsor: string;
        feed: { scrobble: string }[];
      }>(`${feedUrl}/xrpc/app.rocksky.feed.getFeedSkeleton`, {
        params: {
          feed: feed.uri,
          limit: params.limit,
          cursor: params.cursor,
        },
      });
      return { uris: response.data.feed.map(({ scrobble }) => scrobble), ctx };
    },
    catch: (error) => new Error(`Failed to retrieve feed: ${error}`),
  });
};

const hydrate = ({
  uris,
  ctx,
}: {
  uris: string[];
  ctx: Context;
}): Effect.Effect<Scrobbles | undefined, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .where(inArray(tables.scrobbles.uri, uris))
        .orderBy(desc(tables.scrobbles.timestamp))
        .execute(),

    catch: (error) => new Error(`Failed to hydrate feed: ${error}`),
  });
};

const presentation = (data: Scrobbles): Effect.Effect<FeedView, never> => {
  return Effect.sync(() => ({
    feed: data.map(({ scrobbles, tracks, users }) => ({
      scrobble: {
        ...R.omit(["albumArt", "id", "lyrics"])(tracks),
        cover: tracks.albumArt,
        date: scrobbles.timestamp.toISOString(),
        user: users.handle,
        userDisplayName: users.displayName,
        userAvatar: users.avatar,
        uri: scrobbles.uri,
        tags: [],
        id: scrobbles.id,
      },
    })),
  }));
};

type Scrobbles = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
}[];
