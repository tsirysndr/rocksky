import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/previous";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const previous = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withUser,
      Effect.flatMap(withSpotifyRefreshToken),
      Effect.flatMap(withSpotifyToken),
      Effect.flatMap(handlePrevious),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.previous({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(previous(params, auth));
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
          refreshToken,
        })),
    catch: (error) =>
      new Error(`Failed to retrieve Spotify Refresh token: ${error}`),
  });
};

const withSpotifyToken = ({ refreshToken }: { refreshToken: string }) => {
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

const handlePrevious = (accessToken: string) => {
  return Effect.tryPromise({
    try: () =>
      fetch("https://api.spotify.com/v1/me/player/previous", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).then((res) => res.status),
    catch: (error) => new Error(`Failed to handle previous action: ${error}`),
  });
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return Effect.sync(() => ({}));
};
