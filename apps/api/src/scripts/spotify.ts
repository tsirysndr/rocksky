import chalk from "chalk";
import { ctx } from "context";
import { encrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";

const args = process.argv.slice(2);
const clientId = args[0];
const clientSecret = args[1];

if (!clientId || !clientSecret) {
  console.error(
    "Please provide Spotify Client ID and Client Secret as command line arguments",
  );
  console.log(
    chalk.greenBright("Usage: ts-node spotify.ts <client_id> <client_secret>"),
  );
  process.exit(1);
}

await ctx.db
  .insert(tables.spotifyApps)
  .values([
    {
      spotifyAppId: clientId,
      spotifySecret: encrypt(clientSecret, env.SPOTIFY_ENCRYPTION_KEY),
    },
  ])
  .onConflictDoNothing()
  .execute();

process.exit(0);
