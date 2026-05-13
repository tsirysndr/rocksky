import type { Context } from "context";
import { consola } from "consola";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { NeighbourViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorNeighbours";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(10),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getActorNeighbours = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ neighbours: [] });
      }),
    );

  server.app.rocksky.actor.getActorNeighbours({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorNeighbours(params));
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
}): Effect.Effect<{ data: Neighbour[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(or(eq(tables.users.did, params.did), eq(tables.users.handle, params.did)))
        .execute()
        .then((rows) => rows[0]);

      if (!user) throw new Error("User not found");

      const targetArtistRows = await ctx.db
        .select({ artistId: tables.scrobbles.artistId })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.userId, user.id))
        .groupBy(tables.scrobbles.artistId)
        .execute();

      if (targetArtistRows.length === 0) return { data: [] };

      const targetArtistIds = targetArtistRows.map((r) => r.artistId).filter((id): id is string => id !== null);

      const neighbourRows = await ctx.db
        .select({
          userId: tables.scrobbles.userId,
          sharedArtistsCount: sql<number>`count(distinct ${tables.scrobbles.artistId})`,
        })
        .from(tables.scrobbles)
        .where(
          and(
            inArray(tables.scrobbles.artistId, targetArtistIds),
            ne(tables.scrobbles.userId, user.id),
          ),
        )
        .groupBy(tables.scrobbles.userId)
        .orderBy(desc(sql`count(distinct ${tables.scrobbles.artistId})`))
        .limit(50)
        .execute();

      if (neighbourRows.length === 0) return { data: [] };

      const neighbourUserIds = neighbourRows.map((r) => r.userId).filter((id): id is string => id !== null);

      const [neighbourUsers, allNeighbourArtists] = await Promise.all([
        ctx.db
          .select({
            id: tables.users.id,
            avatar: tables.users.avatar,
            did: tables.users.did,
            displayName: tables.users.displayName,
            handle: tables.users.handle,
          })
          .from(tables.users)
          .where(inArray(tables.users.id, neighbourUserIds))
          .execute(),
        ctx.db
          .select({
            userId: tables.scrobbles.userId,
            artistId: tables.scrobbles.artistId,
          })
          .from(tables.scrobbles)
          .where(inArray(tables.scrobbles.userId, neighbourUserIds))
          .groupBy(tables.scrobbles.userId, tables.scrobbles.artistId)
          .execute(),
      ]);

      const userMap = new Map(neighbourUsers.map((u) => [u.id, u]));
      const targetArtistSet = new Set(targetArtistIds);

      const artistsByUser = new Map<string, string[]>();
      for (const row of allNeighbourArtists) {
        if (!row.userId || !row.artistId) continue;
        if (!artistsByUser.has(row.userId)) artistsByUser.set(row.userId, []);
        artistsByUser.get(row.userId)!.push(row.artistId);
      }

      const allTopSharedIds = new Set<string>();
      const sharedByUser = new Map<string, string[]>();
      for (const n of neighbourRows) {
        if (!n.userId) continue;
        const neighbourArtists = artistsByUser.get(n.userId) ?? [];
        const shared = neighbourArtists.filter((id) => targetArtistSet.has(id));
        sharedByUser.set(n.userId, shared);
        shared.slice(0, 5).forEach((id) => allTopSharedIds.add(id));
      }

      const topArtistDetails =
        allTopSharedIds.size > 0
          ? await ctx.db
              .select({
                id: tables.artists.id,
                name: tables.artists.name,
                picture: tables.artists.picture,
                uri: tables.artists.uri,
              })
              .from(tables.artists)
              .where(inArray(tables.artists.id, [...allTopSharedIds]))
              .execute()
          : [];

      const artistDetailMap = new Map(topArtistDetails.map((a) => [a.id, a]));

      const data: Neighbour[] = neighbourRows
        .map((n) => {
          if (!n.userId) return null;
          const u = userMap.get(n.userId);
          if (!u) return null;
          const shared = sharedByUser.get(n.userId) ?? [];
          const topShared = shared.slice(0, 5).map((id) => artistDetailMap.get(id)).filter(Boolean);
          const similarityScore = targetArtistIds.length > 0 ? shared.length / targetArtistIds.length : 0;
          return {
            id: u.id,
            userId: u.id,
            did: u.did,
            handle: u.handle,
            displayName: u.displayName ?? "",
            avatar: u.avatar,
            sharedArtistsCount: Number(n.sharedArtistsCount),
            similarityScore,
            topSharedArtistNames: topShared.map((a) => a!.name),
            topSharedArtistsDetails: topShared.map((a) => ({
              id: a!.id,
              name: a!.name,
              picture: a!.picture,
              uri: a!.uri,
            })),
          };
        })
        .filter((n): n is Neighbour => n !== null);

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve neighbours: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Neighbour[];
}): Effect.Effect<{ neighbours: NeighbourViewBasic[] }, never> => {
  return Effect.sync(() => ({ neighbours: data as NeighbourViewBasic[] }));
};

type Neighbour = {
  id: string;
  userId: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  sharedArtistsCount: number;
  similarityScore: number;
  topSharedArtistNames: string[];
  topSharedArtistsDetails: { id: string; name: string; picture: string | null; uri: string | null }[];
};
