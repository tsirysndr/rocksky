import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/spotify/previous";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import type { SelectUser } from "schema/users";

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
        consola.error(err);
        return Effect.succeed({});
      }),
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
        .leftJoin(
          tables.spotifyApps,
          eq(
            tables.spotifyTokens.spotifyAppId,
            tables.spotifyApps.spotifyAppId,
          ),
        )
        .where(eq(tables.spotifyTokens.userId, user.id))
        .execute()
        .then(([spotifyToken]) => [
          decrypt(
            spotifyToken.spotify_tokens.refreshToken,
            env.SPOTIFY_ENCRYPTION_KEY,
          ),
          decrypt(
            spotifyToken.spotify_apps.spotifySecret,
            env.SPOTIFY_ENCRYPTION_KEY,
          ),
          spotifyToken.spotify_apps.spotifyAppId,
        ])
        .then(([refreshToken, clientSecret, clientId]) => ({
          refreshToken,
          clientId,
          clientSecret,
        })),
    catch: (error) =>
      new Error(`Failed to retrieve Spotify Refresh token: ${error}`),
  });
};

const withSpotifyToken = ({
  refreshToken,
  clientId,
  clientSecret,
}: {
  refreshToken: string;
  clientId: string;
  clientSecret;
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
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })
        .then((res) => res.json() as Promise<{ access_token: string }>)
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
  consola.info("Previous action result:", result);
  return Effect.sync(() => ({}));
};
