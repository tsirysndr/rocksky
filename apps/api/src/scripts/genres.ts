import { ctx } from "context";
import { eq, isNull } from "drizzle-orm";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import _ from "lodash";
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

async function getGenresAndPicture(artists) {
  for (const artist of artists) {
    const token = await getSpotifyToken();
    // search artist by name on spotify
    const result = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then(
        (res) =>
          res.json() as Promise<{
            artists: {
              items: Array<{
                id: string;
                name: string;
                genres: string[];
                images: Array<{ url: string }>;
              }>;
            };
          }>
      )
      .then(async (data) => _.get(data, "artists.items.0"));

    if (result) {
      console.log(JSON.stringify(result, null, 2), "\n");
      if (result.genres && result.genres.length > 0) {
        await ctx.db
          .update(tables.artists)
          .set({ genres: result.genres })
          .where(eq(tables.artists.id, artist.id))
          .execute();
      }
      // update artist picture if not set
      if (!artist.picture && result.images && result.images.length > 0) {
        await ctx.db
          .update(tables.artists)
          .set({ picture: result.images[0].url })
          .where(eq(tables.artists.id, artist.id))
          .execute();
      }
    }

    // sleep for a while to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const PAGE_SIZE = 1000;

const count = await ctx.db
  .select()
  .from(tables.artists)
  .where(isNull(tables.artists.genres))
  .execute()
  .then((res) => res.length);

for (let offset = 0; offset < count; offset += PAGE_SIZE) {
  const artists = await ctx.db
    .select()
    .from(tables.artists)
    .where(isNull(tables.artists.genres))
    .offset(offset)
    .limit(PAGE_SIZE)
    .execute();

  await getGenresAndPicture(artists);
}

console.log(`Artists without genres: ${count}`);

process.exit(0);
