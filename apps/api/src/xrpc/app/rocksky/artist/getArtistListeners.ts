import type { Context } from "context";
import { consola } from "consola";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ListenerViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistListeners";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(5),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("10 seconds"),
      ),
  });

  const getArtistListeners = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ listeners: [] });
      }),
    );

  server.app.rocksky.artist.getArtistListeners({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistListeners(params));
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
}): Effect.Effect<{ data: ArtistListener[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 100;
      const offset = params.offset ?? 0;

      const artist = await ctx.db
        .select({ id: tables.artists.id, name: tables.artists.name })
        .from(tables.artists)
        .where(eq(tables.artists.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      if (!artist) return { data: [] };

      const listenersQuery = await ctx.db
        .select({
          userId: tables.scrobbles.userId,
          totalArtistPlays: count(tables.scrobbles.id),
        })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.artistId, artist.id))
        .groupBy(tables.scrobbles.userId)
        .orderBy(desc(count(tables.scrobbles.id)))
        .limit(limit)
        .offset(offset)
        .execute();

      if (listenersQuery.length === 0) return { data: [] };

      const userIds = listenersQuery
        .map((r) => r.userId)
        .filter((id): id is string => id !== null);

      const [users, trackPlays] = await Promise.all([
        ctx.db
          .select({
            id: tables.users.id,
            avatar: tables.users.avatar,
            did: tables.users.did,
            displayName: tables.users.displayName,
            handle: tables.users.handle,
          })
          .from(tables.users)
          .where(inArray(tables.users.id, userIds))
          .execute(),
        ctx.db
          .select({
            userId: tables.scrobbles.userId,
            title: tables.tracks.title,
            uri: tables.tracks.uri,
            plays: count(tables.scrobbles.id),
          })
          .from(tables.scrobbles)
          .innerJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(
            and(
              eq(tables.scrobbles.artistId, artist.id),
              inArray(tables.scrobbles.userId, userIds),
            ),
          )
          .groupBy(
            tables.scrobbles.userId,
            tables.tracks.id,
            tables.tracks.title,
            tables.tracks.uri,
          )
          .execute(),
      ]);

      const userMap = new Map(users.map((u) => [u.id, u]));

      const mostPlayedByUser = new Map<
        string,
        { title: string; uri: string | null; plays: number }
      >();
      for (const row of trackPlays) {
        if (!row.userId) continue;
        const cur = mostPlayedByUser.get(row.userId);
        const plays = Number(row.plays);
        if (!cur || plays > cur.plays) {
          mostPlayedByUser.set(row.userId, {
            title: row.title,
            uri: row.uri,
            plays,
          });
        }
      }

      const data: ArtistListener[] = listenersQuery
        .map((item, index) => {
          if (!item.userId) return null;
          const u = userMap.get(item.userId);
          if (!u) return null;
          const mostPlayed = mostPlayedByUser.get(item.userId);
          return {
            artist: artist.name,
            avatar: u.avatar,
            did: u.did,
            display_name: u.displayName ?? "",
            handle: u.handle,
            listener_rank: offset + index + 1,
            most_played_track: mostPlayed?.title ?? "",
            most_played_track_uri: mostPlayed?.uri ?? "",
            total_artist_plays: Number(item.totalArtistPlays),
            track_play_count: mostPlayed?.plays ?? 0,
            user_id: item.userId,
          };
        })
        .filter((item): item is ArtistListener => item !== null);

      return { data };
    },
    catch: (error) =>
      new Error(`Failed to retrieve artist's listeners: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: ArtistListener[];
}): Effect.Effect<{ listeners: ListenerViewBasic[] }, never> => {
  return Effect.sync(() => ({
    listeners: data.map((item) => ({
      id: item.user_id,
      did: item.did,
      handle: item.handle,
      displayName: item.display_name,
      avatar: item.avatar,
      mostListenedSong: {
        title: item.most_played_track,
        uri: item.most_played_track_uri,
        playCount: item.track_play_count,
      },
      totalPlays: item.total_artist_plays,
      rank: item.listener_rank,
    })),
  }));
};

type ArtistListener = {
  artist: string;
  avatar: string;
  did: string;
  display_name: string;
  handle: string;
  listener_rank: number;
  most_played_track: string;
  most_played_track_uri: string;
  total_artist_plays: number;
  track_play_count: number;
  user_id: string;
};
