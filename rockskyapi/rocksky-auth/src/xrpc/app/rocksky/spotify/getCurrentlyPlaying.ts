import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { and, eq, or } from "drizzle-orm";
import { Effect, Match, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/getCurrentlyPlaying";
import { createHash } from "node:crypto";
import tables from "schema";
import { SelectSpotifyAccount } from "schema/spotify-accounts";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getCurrentlyPlaying = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withUser,
      Effect.flatMap(withSpotifyAccount),
      Effect.flatMap(retrieve),
      Effect.flatMap(withUriAndLikes),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.getCurrentlyPlaying({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getCurrentlyPlaying(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const withUser = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.actor || did),
            eq(tables.users.handle, params.actor || did)
          )
        )
        .execute()
        .then((users) => ({ user: users[0], ctx, params, did })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const withSpotifyAccount = ({
  params,
  ctx,
  did,
  user,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
  user: SelectUser;
}): Effect.Effect<
  {
    spotifyAccount: SelectSpotifyAccount;
    user: SelectUser;
    ctx: Context;
    params: QueryParams;
    did?: string;
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.spotifyAccounts)
        .leftJoin(
          tables.users,
          eq(tables.users.id, tables.spotifyAccounts.userId)
        )
        .where(
          or(
            eq(tables.users.did, params.actor || did),
            eq(tables.users.handle, params.actor || did)
          )
        )
        .execute()
        .then(([results]) => ({
          spotifyAccount: results.spotify_accounts,
          user,
          ctx,
          params,
          did,
        })),
    catch: (error) => new Error(`Failed to retrieve Spotify account: ${error}`),
  });
};

const retrieve = ({
  spotifyAccount,
  ctx,
  user,
}: {
  spotifyAccount: SelectSpotifyAccount;
  user: SelectUser;
  ctx: Context;
  params: QueryParams;
  did?: string;
}): Effect.Effect<any, Error> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.redis
        .get(`${spotifyAccount.email}:current`)
        .then((cached) =>
          Match.value(cached).pipe(
            Match.when(null, () => ({})),
            Match.when(undefined, () => ({})),
            Match.orElse(() => JSON.parse(cached))
          )
        )
        .then((cached) => [cached, ctx, user]),
    catch: (error) =>
      new Error(`Failed to retrieve currently playing: ${error}`),
  });
};

const withUriAndLikes = ([track, ctx, user]: [any, Context, SelectUser]) => {
  return Effect.tryPromise({
    try: async () => {
      const sha256 = createHash("sha256")
        .update(
          `${track.item.name} - ${track.item.artists.map((x) => x.name).join(", ")} - ${track.item.album.name}`.toLowerCase()
        )
        .digest("hex");
      const [record] = await ctx.db
        .select()
        .from(tables.tracks)
        .where(eq(tables.tracks.sha256, sha256))
        .execute();
      return ctx.db
        .select()
        .from(tables.lovedTracks)
        .leftJoin(
          tables.tracks,
          eq(tables.lovedTracks.trackId, tables.tracks.id)
        )
        .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
        .where(
          and(eq(tables.tracks.sha256, sha256), eq(tables.users.did, user.did))
        )
        .execute()
        .then((results) =>
          Match.value(track).pipe(
            Match.when(
              (t) => Object.keys(t).length > 0,
              () => ({})
            ),
            Match.orElse(() => ({
              ...track,
              songUri: record?.uri,
              artistUri: record?.artistUri,
              albumUri: record?.albumUri,
              liked: results.length > 0,
            }))
          )
        );
    },
    catch: (error) => new Error(`Failed to retrieve URI and likes: ${error}`),
  });
};

const presentation = (track): Effect.Effect<any, never> => {
  return Effect.sync(() => track);
};
