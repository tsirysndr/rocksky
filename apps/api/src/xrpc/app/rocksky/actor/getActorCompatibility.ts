import type { Context } from "context";
import { consola } from "consola";
import { count, desc, eq, inArray, or } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Server } from "lexicon";
import type { CompatibilityViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorCompatibility";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(5),
    lookup: ({ params, did }: { params: QueryParams; did: string | undefined }) =>
      pipe(
        { params, ctx, did },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getActorCompatibility = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get({ params, did: auth.credentials?.did })),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ compatibility: null });
      }),
    );

  server.app.rocksky.actor.getActorCompatibility({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getActorCompatibility(params, auth));
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
  did: string | undefined;
}): Effect.Effect<Compatibility, Error> => {
  return Effect.tryPromise({
    try: async () => {
      if (!did) throw new Error("User not authenticated");

      const [user1, user2] = await Promise.all([
        ctx.db
          .select({ id: tables.users.id })
          .from(tables.users)
          .where(eq(tables.users.did, did))
          .execute()
          .then((rows) => rows[0]),
        ctx.db
          .select({ id: tables.users.id })
          .from(tables.users)
          .where(or(eq(tables.users.did, params.did), eq(tables.users.handle, params.did)))
          .execute()
          .then((rows) => rows[0]),
      ]);

      if (!user1) throw new Error("User1 not found");
      if (!user2) throw new Error("User2 not found");

      const [rawUser1Artists, rawUser2Artists] = await Promise.all([
        ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            scrobbles: count(tables.scrobbles.id),
          })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.userId, user1.id))
          .groupBy(tables.scrobbles.artistId)
          .orderBy(desc(count(tables.scrobbles.id)))
          .execute(),
        ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            scrobbles: count(tables.scrobbles.id),
          })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.userId, user2.id))
          .groupBy(tables.scrobbles.artistId)
          .orderBy(desc(count(tables.scrobbles.id)))
          .execute(),
      ]);

      const user1Artists = rawUser1Artists.filter((a): a is { artistId: string; scrobbles: number } => a.artistId !== null);
      const user2Artists = rawUser2Artists.filter((a): a is { artistId: string; scrobbles: number } => a.artistId !== null);

      const user1Map = new Map(user1Artists.map((a, i) => [a.artistId, i + 1]));
      const user2Map = new Map(user2Artists.map((a, i) => [a.artistId, i + 1]));

      const sharedArtistIds = user1Artists
        .filter((a) => a.artistId && user2Map.has(a.artistId))
        .map((a) => a.artistId)
        .filter((id): id is string => id !== null);

      const sharedCount = sharedArtistIds.length;
      const user1Count = user1Artists.length;
      const user2Count = user2Artists.length;
      const unionCount = user1Count + user2Count - sharedCount;
      const compatibilityPercentage = unionCount > 0 ? (sharedCount / unionCount) * 100 : 0;
      const compatibilityLevel = Math.min(10, Math.round(compatibilityPercentage / 10));

      const topSharedIds = sharedArtistIds.slice(0, 20);

      const topArtistDetails =
        topSharedIds.length > 0
          ? await ctx.db
              .select({
                id: tables.artists.id,
                name: tables.artists.name,
                picture: tables.artists.picture,
                uri: tables.artists.uri,
              })
              .from(tables.artists)
              .where(inArray(tables.artists.id, topSharedIds))
              .execute()
          : [];

      const topSharedDetailed = topArtistDetails
        .map((artist) => {
          const u1Rank = user1Map.get(artist.id) ?? 9999;
          const u2Rank = user2Map.get(artist.id) ?? 9999;
          return {
            id: artist.id,
            name: artist.name,
            picture: artist.picture,
            uri: artist.uri,
            user1_rank: u1Rank,
            user2_rank: u2Rank,
            weight: 1 / (u1Rank + u2Rank),
          };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10);

      return {
        compatibility_level: compatibilityLevel,
        compatibility_percentage: Math.round(compatibilityPercentage * 10) / 10,
        shared_artists: sharedCount,
        top_shared_artists: topSharedDetailed.map((a) => a.name),
        top_shared_detailed_artists: topSharedDetailed,
        user1_artist_count: user1Count,
        user2_artist_count: user2Count,
      };
    },
    catch: (error) => new Error(`Failed to retrieve compatibility: ${error}`),
  });
};

const presentation = (data: Compatibility): Effect.Effect<{ compatibility: CompatibilityViewBasic }, never> => {
  return Effect.sync(() => ({
    compatibility: {
      compatibilityLevel: data.compatibility_level,
      compatibilityPercentage: data.compatibility_percentage,
      sharedArtists: data.shared_artists,
      topSharedArtistNames: data.top_shared_artists,
      topSharedDetailedArtists: data.top_shared_detailed_artists.map((a) => ({
        id: a.id,
        name: a.name,
        picture: a.picture ?? undefined,
        uri: a.uri ?? undefined,
        user1Rank: a.user1_rank,
        user2Rank: a.user2_rank,
        weight: a.weight,
      })),
      user1ArtistCount: data.user1_artist_count,
      user2ArtistCount: data.user2_artist_count,
    },
  }));
};

type Compatibility = {
  compatibility_level: number;
  compatibility_percentage: number;
  shared_artists: number;
  top_shared_artists: string[];
  top_shared_detailed_artists: {
    id: string;
    name: string;
    picture: string | null;
    uri: string | null;
    user1_rank: number;
    user2_rank: number;
    weight: number;
  }[];
  user1_artist_count: number;
  user2_artist_count: number;
};
