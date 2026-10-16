import { consola } from "consola";
import type { Context } from "context";
import { filteredPage } from "lib/filteredPage";
import { dbQuery } from "lib/dbQuery";
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
} from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobbles";
import { getScrobblesVersion } from "lib/feedCache";
import { compileRsqlFilterParam, type RsqlFieldMap } from "lib/rsql";
import * as R from "ramda";
import tables from "schema";
import type { SelectArtist } from "schema/artists";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

const SCROBBLES_CACHE_TTL = 30;

const cacheKey = (params: QueryParams, version: number) =>
  `scrobbles:getScrobbles:v2:${version}:${params.did ?? "anon"}:${
    params.following ? "1" : "0"
  }:${params.limit ?? ""}:${params.offset ?? ""}:${params.filter ?? ""}`;

const FILTER_FIELDS: RsqlFieldMap = {
  uri: tables.scrobbles.uri,
  date: { column: tables.scrobbles.timestamp, type: "date" },
  timestamp: { column: tables.scrobbles.timestamp, type: "date" },
  title: tables.tracks.title,
  artist: tables.tracks.artist,
  album: tables.tracks.album,
  "track.title": tables.tracks.title,
  "track.artist": tables.tracks.artist,
  "track.album": tables.tracks.album,
  "track.albumArtist": tables.tracks.albumArtist,
  "track.genre": tables.tracks.genre,
  "track.duration": { column: tables.tracks.duration, type: "number" },
  "track.isrc": tables.tracks.isrc,
  "track.mbId": tables.tracks.mbId,
  "user.did": tables.users.did,
  "user.handle": tables.users.handle,
  "user.displayName": tables.users.displayName,
  "artist.name": tables.artists.name,
  "artist.genres": { column: tables.artists.genres, type: "string[]" },
};

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
      // Validate the filter up front so malformed expressions surface as a
      // 400 instead of being swallowed by the catchAll below.
      compileRsqlFilterParam(params.filter, FILTER_FIELDS);
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
  return dbQuery("Failed to retrieve scrobbles", async (db) => {
    const scoped = { ...ctx, db };
    const filterUserIds = await getFilterUserIds(scoped, params);

    if (filterUserIds !== null && filterUserIds.length === 0) {
      return [];
    }

    const scrobbles = await fetchScrobbles(scoped, params, filterUserIds);
    return enrichWithLikes(scoped, scrobbles, params.did);
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

export const fetchScrobbles = async (
  ctx: Context,
  params: QueryParams,
  filterUserIds: string[] | null,
) => {
  const baseQuery = ctx.db
    .select({
      scrobbles: tables.scrobbles,
      // `lyrics` can be several KB of text per track; presentation() never
      // reads it, so it's excluded rather than fetched and dropped.
      tracks: R.omit(["lyrics"], getTableColumns(tables.tracks)),
      users: {
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
      // Only `genres` is surfaced (as `tags`) — the rest of the artist row
      // (biography, links, etc.) would just be fetched and discarded.
      artists: { genres: tables.artists.genres },
    })
    .from(tables.scrobbles)
    .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
    .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
    .leftJoin(tables.artists, eq(tables.scrobbles.artistId, tables.artists.id));

  const where = and(
    filterUserIds ? inArray(tables.scrobbles.userId, filterUserIds) : undefined,
    compileRsqlFilterParam(params.filter, FILTER_FIELDS),
  );

  if (params.filter?.trim()) {
    const candidates = ctx.db
      .select({
        id: sql<string>`${tables.scrobbles.id}`.as("id"),
        created_at: sql`${tables.scrobbles.timestamp}`.as("created_at"),
      })
      .from(tables.scrobbles)
      .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
      .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
      .leftJoin(
        tables.artists,
        eq(tables.scrobbles.artistId, tables.artists.id),
      )
      .where(where);
    const ids = await filteredPage(
      ctx.db,
      candidates.getSQL(),
      params.limit || 20,
      params.offset || 0,
    );
    if (!ids.length) return [];
    return baseQuery
      .where(inArray(tables.scrobbles.id, ids))
      .orderBy(desc(tables.scrobbles.timestamp), tables.scrobbles.id)
      .execute();
  }

  const query = where ? baseQuery.where(where) : baseQuery;

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
  const trackIds = [
    ...new Set(
      scrobbles
        .map((row) => row.tracks?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (trackIds.length === 0) {
    return scrobbles.map((row) => ({ ...row, likesCount: 0, liked: false }));
  }

  const [likeCounts, likedRows] = await Promise.all([
    ctx.db
      .select({ trackId: tables.lovedTracks.trackId, count: count() })
      .from(tables.lovedTracks)
      .where(inArray(tables.lovedTracks.trackId, trackIds))
      .groupBy(tables.lovedTracks.trackId)
      .execute(),
    currentUserDid
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
              eq(tables.users.did, currentUserDid),
            ),
          )
          .execute()
      : Promise.resolve([]),
  ]);

  const likesCountMap = new Map(likeCounts.map((r) => [r.trackId, r.count]));
  const likedSet = new Set(likedRows.map((r) => r.trackId));

  return scrobbles.map((row) => ({
    ...row,
    likesCount: likesCountMap.get(row.tracks?.id ?? "") ?? 0,
    liked: row.tracks?.id ? likedSet.has(row.tracks.id) : false,
  }));
};

const presentation = (
  data: Scrobbles,
): Effect.Effect<ScrobblesResponse, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map(
      ({ scrobbles, tracks, users, artists, liked, likesCount }) => ({
        // `createdAt` is omitted from the track spread because the regenerated
        // ScrobbleViewBasic types it as a string (the scrobble timestamp),
        // whereas tracks.createdAt is the track row's Date. `date`/`cover`/
        // `user` are kept for backward compatibility (allowed by the view's
        // open index signature).
        ...R.omit(["albumArt", "id", "createdAt"])(tracks),
        cover: tracks.albumArt,
        date: scrobbles.timestamp.toISOString(),
        createdAt: scrobbles.timestamp.toISOString(),
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
  tracks: Omit<SelectTrack, "lyrics">;
  users: Pick<SelectUser, "handle" | "displayName" | "avatar">;
  artists: Pick<SelectArtist, "genres"> | null;
  liked: boolean;
  likesCount: number;
}[];
