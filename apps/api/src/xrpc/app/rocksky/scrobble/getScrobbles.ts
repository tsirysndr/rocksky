import type { Context } from "context";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/scrobble/getScrobbles";
import * as R from "ramda";
import tables from "schema";
import type { SelectScrobble } from "schema/scrobbles";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getScrobbles = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error("Error retrieving scrobbles:", err);
        return Effect.succeed({ scrobbles: [] });
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
}): Effect.Effect<Scrobbles | undefined, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const baseQuery = ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id));

      if (params.did && params.following) {
        const followedUsers = await ctx.db
          .select({ subjectDid: tables.follows.subject_did })
          .from(tables.follows)
          .where(eq(tables.follows.follower_did, params.did))
          .execute();

        const followedDids = followedUsers.map((f) => f.subjectDid);

        if (followedDids.length > 0) {
          const scrobbles = await baseQuery
            .where(inArray(tables.users.did, followedDids))
            .orderBy(desc(tables.scrobbles.timestamp))
            .offset(params.offset || 0)
            .limit(params.limit || 20)
            .execute();

          const trackIds = scrobbles.map((row) => row.tracks?.id).filter(
            Boolean,
          );

          const likes = await ctx.db
            .select()
            .from(tables.lovedTracks)
            .leftJoin(
              tables.users,
              eq(tables.lovedTracks.userId, tables.users.id),
            )
            .where(inArray(tables.lovedTracks.trackId, trackIds))
            .execute();

          const likesMap = new Map<string, { count: number; liked: boolean }>();

          for (const trackId of trackIds) {
            const trackLikes = likes.filter(
              (l) => l.loved_tracks.trackId === trackId,
            );
            likesMap.set(trackId, {
              count: trackLikes.length,
              liked: trackLikes.some((l) => l.users.did === params.did),
            });
          }

          return scrobbles.map((row) => ({
            ...row,
            likesCount: likesMap.get(row.tracks?.id)?.count ?? 0,
            liked: likesMap.get(row.tracks?.id)?.liked ?? false,
          }));
        } else {
          return [];
        }
      }

      const scrobbles = await baseQuery
        .orderBy(desc(tables.scrobbles.timestamp))
        .offset(params.offset || 0)
        .limit(params.limit || 20)
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
          liked: trackLikes.some((l) => l.users.did === params.did),
        });
      }

      return scrobbles.map((row) => ({
        ...row,
        likesCount: likesMap.get(row.tracks?.id)?.count ?? 0,
        liked: likesMap.get(row.tracks?.id)?.liked ?? false,
      }));
    },

    catch: (error) => new Error(`Failed to retrieve scrobbles: ${error}`),
  });
};

const presentation = (
  data: Scrobbles,
): Effect.Effect<{ scrobbles: ScrobbleViewBasic[] }, never> => {
  return Effect.sync(() => ({
    scrobbles: data.map(({ scrobbles, tracks, users, liked, likesCount }) => ({
      ...R.omit(["albumArt", "id", "lyrics"])(tracks),
      cover: tracks.albumArt,
      date: scrobbles.timestamp.toISOString(),
      user: users.handle,
      userDisplayName: users.displayName,
      userAvatar: users.avatar,
      uri: scrobbles.uri,
      tags: [],
      id: scrobbles.id,
      trackUri: tracks.uri,
      likesCount: likesCount,
      liked: liked,
    })),
  }));
};

type Scrobbles = {
  scrobbles: SelectScrobble;
  tracks: SelectTrack;
  users: SelectUser;
  liked: boolean;
  likesCount: number;
}[];
