import type { Context } from "context";
import { consola } from "consola";
import { desc, eq, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobbles";
import { getScrobblesVersion } from "lib/feedCache";
import * as R from "ramda";
import tables from "schema";
import type { SelectArtist } from "schema/artists";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

const SCROBBLES_CACHE_TTL = 30;

const cacheKey = (params: QueryParams, version: number) =>
  `scrobbles:getScrobbles:v1:${version}:${params.did ?? "anon"}:${
    params.following ? "1" : "0"
  }:${params.limit ?? ""}:${params.offset ?? ""}`;

type ScrobblesResponse = { scrobbles: ScrobbleViewBasic[] };

export default function (server: Server, ctx: Context) {
  const getScrobbles = (params: QueryParams) =>
    pipe(
      Effect.tryPromise({
        try: () => getScrobblesVersion(ctx),
        catch: () => 0,
      }),
      Effect.flatMap((version) => {
        const key = cacheKey(params, version);
        return pipe(
          Effect.tryPromise({
            try: () => ctx.redis.get(key),
            catch: () => null,
          }),
          Effect.flatMap((cached) =>
            cached
              ? Effect.succeed(JSON.parse(cached) as ScrobblesResponse)
              : pipe(
                  { params, ctx },
                  retrieve,
                  Effect.flatMap(presentation),
                  Effect.tap((view) =>
                    Effect.tryPromise({
                      try: () =>
                        ctx.redis.setEx(
                          key,
                          SCROBBLES_CACHE_TTL,
                          JSON.stringify(view),
                        ),
                      catch: () => null,
                    }),
                  ),
                ),
          ),
        );
      }),
      Effect.timeout("20 seconds"),
      Effect.catchAll((err) => {
        consola.error("Error retrieving scrobbles:", err);
        return Effect.succeed<ScrobblesResponse>({ scrobbles: [] });
      }),
    );
  server.app.rocksky.scrobble.getScrobbles({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getScrobbles(params));
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
}): Effect.Effect<Scrobbles, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const filterUserIds = await getFilterUserIds(ctx, params);

      if (filterUserIds !== null && filterUserIds.length === 0) {
        return [];
      }

      const scrobbles = await fetchScrobbles(ctx, params, filterUserIds);
      return enrichWithLikes(ctx, scrobbles, params.did);
    },
    catch: (error) => new Error(`Failed to retrieve scrobbles: ${error}`),
  });
};

const getFilterUserIds = async (
  ctx: Context,
  params: QueryParams,
): Promise<string[] | null> => {
  if (!params.did || !params.following) {
    return null;
  }

  const rows = await ctx.db
    .select({ userId: tables.users.id })
    .from(tables.follows)
    .innerJoin(tables.users, eq(tables.users.did, tables.follows.subject_did))
    .where(eq(tables.follows.follower_did, params.did))
    .execute();

  return rows.map((r) => r.userId);
};

const fetchScrobbles = async (
  ctx: Context,
  params: QueryParams,
  filterUserIds: string[] | null,
) => {
  const baseQuery = ctx.db
    .select()
    .from(tables.scrobbles)
    .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
    .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
    .leftJoin(tables.artists, eq(tables.scrobbles.artistId, tables.artists.id));

  const query = filterUserIds
    ? baseQuery.where(inArray(tables.scrobbles.userId, filterUserIds))
    : baseQuery;

  return query
    .orderBy(desc(tables.scrobbles.timestamp))
    .offset(params.offset || 0)
    .limit(params.limit || 20)
    .execute();
};

const enrichWithLikes = async (
  ctx: Context,
  scrobbles: Awaited<ReturnType<typeof fetchScrobbles>>,
  currentUserDid?: string,
) => {
  const trackIds = scrobbles
    .map((row) => row.tracks?.id)
    .filter((id): id is string => Boolean(id));

  if (trackIds.length === 0) {
    return scrobbles.map((row) => ({ ...row, likesCount: 0, liked: false }));
  }

  const likes = await ctx.db
    .select()
    .from(tables.lovedTracks)
    .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
    .where(inArray(tables.lovedTracks.trackId, trackIds))
    .execute();

  const likesMap = new Map<string, { count: number; liked: boolean }>();

  for (const trackId of trackIds) {
    const trackLikes = likes.filter((l) => l.loved_tracks.trackId === trackId);
    likesMap.set(trackId, {
      count: trackLikes.length,
      liked: trackLikes.some((l) => l.users?.did === currentUserDid),
    });
  }

  return scrobbles.map((row) => ({
    ...row,
    likesCount: likesMap.get(row.tracks?.id ?? "")?.count ?? 0,
    liked: likesMap.get(row.tracks?.id ?? "")?.liked ?? false,
  }));
};

const presentation = (
  data: Scrobbles,
): Effect.Effect<ScrobblesResponse, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map(
      ({ scrobbles, tracks, users, artists, liked, likesCount }) => ({
        ...R.omit(["albumArt", "id", "lyrics"])(tracks),
        cover: tracks.albumArt,
        date: scrobbles.timestamp.toISOString(),
        user: users.handle,
        userDisplayName: users.displayName,
        userAvatar: users.avatar,
        uri: scrobbles.uri,
        tags: artists?.genres,
        id: scrobbles.id,
        trackUri: tracks.uri,
        likesCount,
        liked,
      }),
    ),
  }));
};

type Scrobbles = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
  artists: SelectArtist;
  liked: boolean;
  likesCount: number;
}[];
