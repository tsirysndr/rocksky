import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/spotify/next";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const next = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withUser,
      Effect.flatMap(withSpotifyRefreshToken),
      Effect.flatMap(withSpotifyToken),
      Effect.flatMap(handleNext),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.next({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(next(params, auth));
    },
  });
}

const withUser = ({
  did,
  ctx,
}: {
  params: QueryParams;
  did: string;
  ctx: Context;
}) => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then(([user]) => ({
          user,
          ctx,
          did,
        })),
    catch: (error) => new Error(`Failed to retrieve User: ${error}`),
  });
};

const withSpotifyRefreshToken = ({
  user,
  ctx,
}: {
  user: SelectUser;
  ctx: Context;
}) => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.spotifyTokens)
        .where(eq(tables.spotifyTokens.userId, user.id))
        .execute()
        .then(([spotifyToken]) =>
          decrypt(spotifyToken.refreshToken, env.SPOTIFY_ENCRYPTION_KEY)
        )
        .then((refreshToken) => ({
          user,
          ctx,
          refreshToken,
        })),
    catch: (error) =>
      new Error(`Failed to retrieve Spotify Refresh token: ${error}`),
  });
};

const withSpotifyToken = ({
  refreshToken,
  ctx,
}: {
  refreshToken: string;
  ctx: Context;
}) => {
  return Effect.tryPromise({
    try: () =>
      fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: env.SPOTIFY_CLIENT_ID,
          client_secret: env.SPOTIFY_CLIENT_SECRET,
        }),
      })
        .then((res) => res.json() as Promise<{ access_token: string }>)
        .then((data) => data.access_token),
    catch: (error) => new Error(`Failed to retrieve Spotify token: ${error}`),
  });
};

const handleNext = (accessToken: string) => {
  return Effect.tryPromise({
    try: () =>
      fetch("https://api.spotify.com/v1/me/player/next", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).then((res) => res.status),
    catch: (error) => new Error(`Failed to handle next action: ${error}`),
  });
};

const presentation = (result): Effect.Effect<{}, never> => {
  // Logic to format the result for presentation
  console.log("Next action result:", result);
  return Effect.sync(() => ({}));
};
