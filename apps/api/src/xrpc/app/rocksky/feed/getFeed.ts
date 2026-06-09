import type { Context } from "context";
import { consola } from "consola";
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
import type { HandlerAuth } from "@atproto/xrpc-server";
import { env } from "lib/env";
import { getFeedVersion } from "lib/feedCache";
import type { SelectArtist } from "schema/artists";

const FEED_CACHE_TTL = 30;
const cacheKey = (params: QueryParams, version: number, did?: string) =>
  `feed:getFeed:v2:${did ?? "anon"}:${params.feed}:${version}:${params.limit ?? ""}:${params.cursor ?? ""}`;

export default function (server: Server, ctx: Context) {
  const getFeed = (params: QueryParams, auth: HandlerAuth) => {
    const did = auth.credentials?.did;

    return pipe(
      Effect.tryPromise({
        try: () => getFeedVersion(ctx, params.feed),
        catch: () => 0,
      }),
      Effect.flatMap((version) => {
        const key = cacheKey(params, version, did);
        return pipe(
          Effect.tryPromise({
            try: () => ctx.redis.get(key),
            catch: () => null,
          }),
          Effect.flatMap((cached) =>
            cached
              ? Effect.succeed(JSON.parse(cached) as FeedView)
              : pipe(
                  { params, ctx, did },
                  retrieve,
                  Effect.flatMap(hydrate),
                  Effect.flatMap(presentation),
                  Effect.tap((view) =>
                    Effect.tryPromise({
                      try: () =>
                        ctx.redis.setEx(
                          key,
                          FEED_CACHE_TTL,
                          JSON.stringify(view),
                        ),
                      catch: () => null,
                    }),
                  ),
                ),
          ),
        );
      }),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("Error retrieving scrobbles:", err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  };
  server.app.rocksky.feed.getFeed({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getFeed(params, auth));
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
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
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
      const feedUrl = env.PUBLIC_URL.includes("localhost")
        ? "http://localhost:8002"
        : `https://${feed.did.split("did:web:")[1]}`;
      const response = await axios.get<{
        cursor?: string;
        feed: { scrobble: string }[];
      }>(`${feedUrl}/xrpc/app.rocksky.feed.getFeedSkeleton`, {
        params: {
          feed: feed.uri,
          limit: params.limit,
          cursor: params.cursor,
        },
      });
      return {
        uris: response.data.feed.map(({ scrobble }) => scrobble),
        cursor: response.data.cursor,
        ctx,
        did,
      };
    },
    catch: (error) => new Error(`Failed to retrieve feed: ${error}`),
  });
};

const hydrate = ({
  uris,
  cursor,
  ctx,
  did,
}: {
  uris: string[];
  cursor?: string;
  ctx: Context;
  did?: string;
}): Effect.Effect<ScrobblesWithCursor | undefined, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const scrobbles = await ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .leftJoin(
          tables.artists,
          eq(tables.tracks.artistUri, tables.artists.uri),
        )
        .where(inArray(tables.scrobbles.uri, uris))
        .orderBy(desc(tables.scrobbles.timestamp))
        .execute();

      const trackIds = scrobbles.map((row) => row.tracks?.id).filter(Boolean);

      const likes = await ctx.db
        .select()
        .from(tables.lovedTracks)
        .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
        .where(inArray(tables.lovedTracks.trackId, trackIds))
        .execute();

      const likesMap = new Map<string, { count: number; liked: boolean }>();

      for (const trackId of trackIds) {
        const trackLikes = likes.filter(
          (l) => l.loved_tracks.trackId === trackId,
        );
        likesMap.set(trackId, {
          count: trackLikes.length,
          liked: trackLikes.some((l) => l.users.did === did),
        });
      }

      const result = scrobbles.map((row) => ({
        ...row,
        likesCount: likesMap.get(row.tracks?.id)?.count ?? 0,
        liked: likesMap.get(row.tracks?.id)?.liked ?? false,
      }));

      if (did) {
        const [u] = await ctx.db
          .select()
          .from(tables.users)
          .where(eq(tables.users.did, did))
          .limit(1)
          .execute();

        const userPayload = {
          xata_id: u.id,
          did: u.did,
          handle: u.handle,
          display_name: u.displayName,
          avatar: u.avatar,
          xata_createdat: u.createdAt.toISOString(),
          xata_updatedat: u.updatedAt.toISOString(),
          xata_version: u.xataVersion,
        };

        ctx.nc.publish(
          "rocksky.user",
          Buffer.from(JSON.stringify(userPayload)),
        );
      }

      return { scrobbles: result, cursor };
    },

    catch: (error) => new Error(`Failed to hydrate feed: ${error}`),
  });
};

const presentation = (
  data: ScrobblesWithCursor,
): Effect.Effect<FeedView, never> => {
  return Effect.sync(() => ({
    feed: data.scrobbles.map(
      ({ scrobbles, tracks, users, likesCount, liked, artists }) => ({
        scrobble: {
          ...R.omit(["albumArt", "id", "lyrics"])(tracks),
          cover: tracks.albumArt,
          date: scrobbles.timestamp.toISOString(),
          user: users.handle,
          userDisplayName: users.displayName,
          userAvatar: users.avatar,
          uri: scrobbles.uri,
          tags: artists?.genres,
          likesCount,
          liked,
          trackUri: tracks.uri,
          createdAt: scrobbles.createdAt.toISOString(),
          updatedAt: scrobbles.updatedAt.toISOString(),
          id: scrobbles.id,
        },
      }),
    ),
    cursor: data.cursor,
  }));
};

type Scrobbles = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
  artists: SelectArtist;
  likesCount: number;
  liked: boolean;
}[];

type ScrobblesWithCursor = {
  scrobbles: Scrobbles;
  cursor?: string;
};
