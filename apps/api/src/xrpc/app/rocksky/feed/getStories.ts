import type { HandlerAuth } from "@atproto/xrpc-server";
import axios from "axios";
import type { Context } from "context";
import { consola } from "consola";
import { desc, eq, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { StoriesView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getStories";
import { env } from "lib/env";
import albums from "schema/albums";
import artists from "schema/artists";
import feeds from "schema/feeds";
import follows from "schema/follows";
import scrobbles from "schema/scrobbles";
import tracks from "schema/tracks";
import users from "schema/users";

export default function (server: Server, ctx: Context) {
  const storiesCache = Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(30),
    lookup: (key: { params: QueryParams; did?: string }) =>
      pipe(
        { params: key.params, ctx, did: key.did },
        retrieve,
        Effect.map((data) => ({ data })),
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getStories = (params: QueryParams, auth: HandlerAuth) => {
    const did = auth.credentials?.did;
    if (params.following && !did) {
      return Effect.fail(
        new Error("Authentication required when filtering by following"),
      );
    }
    return pipe(
      storiesCache,
      Effect.flatMap((cache) => cache.get({ params, did })),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  };
  server.app.rocksky.feed.getStories({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getStories(params, auth));
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
}): Effect.Effect<NowPlayingRecord[], Error, never> => {
  return Effect.tryPromise({
    try: async () => {
      const baseSelect = {
        xataId: scrobbles.id,
        trackId: tracks.id,
        title: tracks.title,
        artist: tracks.artist,
        albumArtist: tracks.albumArtist,
        album: tracks.album,
        albumArt: tracks.albumArt,
        handle: users.handle,
        did: users.did,
        avatar: users.avatar,
        uri: scrobbles.uri,
        trackUri: tracks.uri,
        artistUri: artists.uri,
        albumUri: albums.uri,
        timestamp: scrobbles.timestamp,
      };
      const size = params.size || 20;

      let feedUris: string[] | undefined;
      if (params.feed) {
        feedUris = await resolveFeedScrobbleUris(ctx, params.feed);
        if (feedUris.length === 0) {
          return [];
        }
      }

      let followedUserIds: string[] | undefined;
      if (params.following && did) {
        const rows = await ctx.db
          .select({ id: users.id })
          .from(follows)
          .innerJoin(users, eq(users.did, follows.subject_did))
          .where(eq(follows.follower_did, did))
          .execute();
        followedUserIds = rows.map((r) => r.id);
        if (followedUserIds.length === 0) {
          return [];
        }
      }

      const innerFilters = [
        feedUris ? sql`inner_s.uri IN ${feedUris}` : null,
        followedUserIds ? sql`inner_s.user_id IN ${followedUserIds}` : null,
      ].filter((c): c is NonNullable<typeof c> => c !== null);

      const innerWhere =
        innerFilters.length > 0
          ? sql`WHERE ${sql.join(innerFilters, sql` AND `)}`
          : sql``;

      return ctx.db
        .select(baseSelect)
        .from(scrobbles)
        .leftJoin(artists, eq(scrobbles.artistId, artists.id))
        .leftJoin(albums, eq(scrobbles.albumId, albums.id))
        .leftJoin(tracks, eq(scrobbles.trackId, tracks.id))
        .leftJoin(users, eq(scrobbles.userId, users.id))
        .where(
          sql`${scrobbles.id} IN (
            SELECT DISTINCT ON (inner_s.user_id) inner_s.xata_id
            FROM scrobbles inner_s
            ${innerWhere}
            ORDER BY inner_s.user_id, inner_s.timestamp DESC, inner_s.xata_id DESC
          )`,
        )
        .orderBy(desc(scrobbles.timestamp))
        .limit(size)
        .execute();
    },
    catch: (error) =>
      new Error(`Failed to retrieve now playing songs: ${error}`),
  });
};

const resolveFeedScrobbleUris = async (
  ctx: Context,
  feedUri: string,
): Promise<string[]> => {
  const [feed] = await ctx.db
    .select()
    .from(feeds)
    .where(eq(feeds.uri, feedUri))
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
    params: { feed: feed.uri },
  });
  return response.data.feed.map(({ scrobble }) => scrobble);
};

const presentation = ({
  data,
}: {
  data: NowPlayingRecord[];
}): Effect.Effect<StoriesView, never> => {
  return Effect.sync(() => ({
    stories: data.map((record) => ({
      album: record.album,
      albumArt: record.albumArt,
      albumArtist: record.albumArtist,
      albumUri: record.albumUri,
      artist: record.artist,
      artistUri: record.artistUri,
      avatar: record.avatar,
      createdAt: record.timestamp.toISOString(),
      did: record.did,
      handle: record.handle,
      id: record.trackId,
      title: record.title,
      trackId: record.trackId,
      trackUri: record.trackUri,
      uri: record.uri,
    })),
  }));
};

type NowPlayingRecord = {
  xataId: string;
  trackId: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string;
  handle: string;
  did: string;
  avatar: string;
  uri: string;
  trackUri: string;
  artistUri: string;
  albumUri: string;
  timestamp: Date;
};
