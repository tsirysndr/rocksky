import { ctx } from "context";
import { eq } from "drizzle-orm";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";

async function getSpotifyToken(): Promise<string> {
  const spotifyTokens = await ctx.db
    .select()
    .from(tables.spotifyTokens)
    .leftJoin(
      tables.spotifyAccounts,
      eq(tables.spotifyAccounts.userId, tables.spotifyTokens.userId)
    )
    .where(eq(tables.spotifyAccounts.isBetaUser, true))
    .execute()
    .then((res) => res.map(({ spotify_tokens }) => spotify_tokens));

  const record =
    spotifyTokens[Math.floor(Math.random() * spotifyTokens.length)];
  const refreshToken = decrypt(record.refreshToken, env.SPOTIFY_ENCRYPTION_KEY);

  const accessToken = await fetch("https://accounts.spotify.com/api/token", {
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
    .then((data) => data.access_token);

  return accessToken;
}

async function getTidalToken(): Promise<string> {
  return "";
}
