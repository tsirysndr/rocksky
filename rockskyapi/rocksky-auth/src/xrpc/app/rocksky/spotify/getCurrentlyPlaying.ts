import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/getCurrentlyPlaying";
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
}: {
  spotifyAccount: SelectSpotifyAccount;
  user: SelectUser;
  ctx: Context;
  params: QueryParams;
  did?: string;
}): Effect.Effect<{}, Error> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.redis.get(`${spotifyAccount.email}:current`).then((cached) => {
        if (cached) {
          return JSON.parse(cached);
        }
        return {};
      }),
    catch: (error) =>
      new Error(`Failed to retrieve currently playing: ${error}`),
  });
};

const presentation = (currentlyPlaying): Effect.Effect<any, never> => {
  return Effect.sync(() => currentlyPlaying);
};
