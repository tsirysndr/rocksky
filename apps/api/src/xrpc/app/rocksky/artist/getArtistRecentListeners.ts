import type { Context } from "context";
import { consola } from "consola";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { RecentListenerView } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistRecentListeners";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(1),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("10 seconds"),
      ),
  });

  const getArtistRecentListeners = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ listeners: [] });
      }),
    );

  server.app.rocksky.artist.getArtistRecentListeners({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistRecentListeners(params));
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
}): Effect.Effect<{ data: RecentListener[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 20;
      const offset = params.offset ?? 0;

      const artist = await ctx.db
        .select({ id: tables.artists.id })
        .from(tables.artists)
        .where(eq(tables.artists.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      if (!artist) return { data: [] };

      const latestRows = await ctx.db
        .select({
          userId: tables.scrobbles.userId,
          lastTimestamp: max(tables.scrobbles.timestamp),
        })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.artistId, artist.id))
        .groupBy(tables.scrobbles.userId)
        .orderBy(desc(max(tables.scrobbles.timestamp)))
        .limit(limit)
        .offset(offset)
        .execute();

      if (latestRows.length === 0) return { data: [] };

      const userIds = latestRows
        .map((r) => r.userId)
        .filter((id): id is string => id !== null);

      const users = await ctx.db
        .select({
          id: tables.users.id,
          avatar: tables.users.avatar,
          did: tables.users.did,
          displayName: tables.users.displayName,
          handle: tables.users.handle,
        })
        .from(tables.users)
        .where(inArray(tables.users.id, userIds))
        .execute();

      const userMap = new Map(users.map((u) => [u.id, u]));

      const scrobbleRows = await ctx.db
        .select({
          userId: tables.scrobbles.userId,
          uri: tables.scrobbles.uri,
          timestamp: tables.scrobbles.timestamp,
        })
        .from(tables.scrobbles)
        .where(
          and(
            eq(tables.scrobbles.artistId, artist.id),
            inArray(tables.scrobbles.userId, userIds),
          ),
        )
        .execute();

      const latestScrobbleByUser = new Map<
        string,
        { uri: string | null; timestamp: Date }
      >();
      for (const row of scrobbleRows) {
        if (!row.userId) continue;
        const cur = latestScrobbleByUser.get(row.userId);
        if (!cur || row.timestamp > cur.timestamp) {
          latestScrobbleByUser.set(row.userId, {
            uri: row.uri,
            timestamp: row.timestamp,
          });
        }
      }

      const data: RecentListener[] = latestRows
        .map((item) => {
          if (!item.userId || !item.lastTimestamp) return null;
          const u = userMap.get(item.userId);
          if (!u) return null;
          const scrobble = latestScrobbleByUser.get(item.userId);
          return {
            id: u.id,
            did: u.did,
            handle: u.handle,
            displayName: u.displayName ?? "",
            avatar: u.avatar,
            timestamp: new Date(item.lastTimestamp).toISOString(),
            scrobbleUri: scrobble?.uri ?? "",
          };
        })
        .filter((item): item is RecentListener => item !== null);

      return { data };
    },
    catch: (error) =>
      new Error(`Failed to retrieve artist's recent listeners: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: RecentListener[];
}): Effect.Effect<{ listeners: RecentListenerView[] }, never> => {
  return Effect.sync(() => ({
    listeners: data.map((item) => ({
      id: item.id,
      did: item.did,
      handle: item.handle,
      displayName: item.displayName,
      avatar: item.avatar,
      timestamp: item.timestamp,
      scrobbleUri: item.scrobbleUri,
    })),
  }));
};

type RecentListener = {
  id: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  timestamp: string;
  scrobbleUri: string;
};
