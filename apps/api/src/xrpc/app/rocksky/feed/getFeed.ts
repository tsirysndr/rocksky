import type { HandlerAuth } from "@atproto/xrpc-server";
import axios from "axios";
import { consola } from "consola";
import type { Context } from "context";
import { and, count, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { FeedView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getFeed";
import { transientDbRetry } from "lib/dbRetry";
import { env } from "lib/env";
import { getFeedVersion } from "lib/feedCache";
import * as R from "ramda";
import tables from "schema";
import type { SelectArtist } from "schema/artists";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

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
      Effect.retry(transientDbRetry),
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
        .select({
          scrobbles: tables.scrobbles,
          // `lyrics` can be several KB of text per track; presentation()
          // never reads it, so it's excluded rather than fetched and dropped.
          tracks: R.omit(["lyrics"], getTableColumns(tables.tracks)),
          users: {
            handle: tables.users.handle,
            displayName: tables.users.displayName,
            avatar: tables.users.avatar,
          },
          // Only `genres` is surfaced (as `tags`) — the rest of the artist
          // row (biography, links, etc.) would just be fetched and discarded.
          artists: { genres: tables.artists.genres },
        })
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

      const trackIds = [
        ...new Set(scrobbles.map((row) => row.tracks?.id).filter(Boolean)),
      ];

      const [likeCounts, likedRows] = trackIds.length
        ? await Promise.all([
            ctx.db
              .select({ trackId: tables.lovedTracks.trackId, count: count() })
              .from(tables.lovedTracks)
              .where(inArray(tables.lovedTracks.trackId, trackIds))
              .groupBy(tables.lovedTracks.trackId)
              .execute(),
            did
              ? ctx.db
                  .select({ trackId: tables.lovedTracks.trackId })
                  .from(tables.lovedTracks)
                  .innerJoin(
                    tables.users,
                    eq(tables.lovedTracks.userId, tables.users.id),
                  )
                  .where(
                    and(
                      inArray(tables.lovedTracks.trackId, trackIds),
                      eq(tables.users.did, did),
                    ),
                  )
                  .execute()
              : Promise.resolve([]),
          ])
        : [[], []];

      const likesCountMap = new Map(likeCounts.map((r) => [r.trackId, r.count]));
      const likedSet = new Set(likedRows.map((r) => r.trackId));

      const result = scrobbles.map((row) => ({
        ...row,
        likesCount: likesCountMap.get(row.tracks?.id ?? "") ?? 0,
        liked: row.tracks?.id ? likedSet.has(row.tracks.id) : false,
      }));

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
          ...R.omit(["albumArt", "id"])(tracks),
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
  tracks: Omit<SelectTrack, "lyrics">;
  users: Pick<SelectUser, "handle" | "displayName" | "avatar">;
  artists: Pick<SelectArtist, "genres"> | null;
  likesCount: number;
  liked: boolean;
}[];

type ScrobblesWithCursor = {
  scrobbles: Scrobbles;
  cursor?: string;
};
