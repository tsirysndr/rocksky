import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/spotify/seek";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const seek = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withUser,
      Effect.flatMap(withSpotifyRefreshToken),
      Effect.flatMap(withSpotifyToken),
      Effect.flatMap(handleSeek),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.spotify.seek({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(seek(params, auth));
    },
  });
}

const withUser = ({
  did,
  ctx,
  params,
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
          params,
        })),
    catch: (error) => new Error(`Failed to retrieve User: ${error}`),
  });
};

const withSpotifyRefreshToken = ({
  user,
  ctx,
  params,
}: {
  user: SelectUser;
  ctx: Context;
  params: QueryParams;
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
          params,
        })),
    catch: (error) =>
      new Error(`Failed to retrieve Spotify Refresh token: ${error}`),
  });
};

const withSpotifyToken = ({
  refreshToken,
  clientSecret,
  clientId,
  params,
}: {
  refreshToken: string;
  clientSecret: string;
  clientId: string;
  params: QueryParams;
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
        .then((data) => ({
          accessToken: data.access_token,
          position: params.position,
        })),
    catch: (error) => new Error(`Failed to retrieve Spotify token: ${error}`),
  });
};

const handleSeek = ({
  accessToken,
  position,
}: {
  accessToken: string;
  position: number;
}) => {
  return Effect.tryPromise({
    try: () =>
      fetch(
        `https://api.spotify.com/v1/me/player/seek?position_ms=${position}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      ).then((res) => res.status),
    catch: (error) => new Error(`Failed to handle next action: ${error}`),
  });
};

const presentation = (result) => {
  // Logic to format the result for presentation
  consola.info("Seek action result:", result);
  return Effect.sync(() => ({}));
};
