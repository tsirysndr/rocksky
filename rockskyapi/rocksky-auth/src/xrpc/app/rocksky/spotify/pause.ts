import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/pause";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const pause = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withUser,
      Effect.flatMap(withSpotifyRefreshToken),
      Effect.flatMap(withSpotifyToken),
      Effect.flatMap(handlePause),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.pause({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(pause(params, auth));
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
        .then((res) => res.json())
        .then((data) => data.access_token),
    catch: (error) => new Error(`Failed to retrieve Spotify token: ${error}`),
  });
};

const handlePause = (params) => {
  // Logic to handle the pause action in Spotify
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to handle pause action: ${error}`),
  });
};

const presentation = (result): Effect.Effect<{}, never> => {
  // Logic to format the result for presentation
  return Effect.sync(() => ({}));
};
