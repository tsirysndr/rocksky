import type { Context } from "context";
import { consola } from "consola";
import { desc, eq, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { StoriesView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getStories";
import albums from "schema/albums";
import artists from "schema/artists";
import scrobbles from "schema/scrobbles";
import tracks from "schema/tracks";
import users from "schema/users";

export default function (server: Server, ctx: Context) {
  const storiesCache = Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(30),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.map((data) => ({ data })),
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getStories = (params: QueryParams) =>
    pipe(
      storiesCache,
      Effect.flatMap((cache) => cache.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.feed.getStories({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getStories(params));
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
}): Effect.Effect<NowPlayingRecord[], Error, never> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select({
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
        })
        .from(scrobbles)
        .leftJoin(artists, eq(scrobbles.artistId, artists.id))
        .leftJoin(albums, eq(scrobbles.albumId, albums.id))
        .leftJoin(tracks, eq(scrobbles.trackId, tracks.id))
        .leftJoin(users, eq(scrobbles.userId, users.id))
        .where(
          sql`scrobbles.xata_id IN (
            SELECT DISTINCT ON (inner_s.user_id) inner_s.xata_id
            FROM scrobbles inner_s
            ORDER BY inner_s.user_id, inner_s.timestamp DESC, inner_s.xata_id DESC
          )`,
        )
        .orderBy(desc(scrobbles.timestamp))
        .limit(params.size || 20)
        .execute(),
    catch: (error) =>
      new Error(`Failed to retrieve now playing songs: ${error}`),
  });
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
