import chalk from "chalk";
import { RockskyClient } from "client";

export async function artists(did, { skip, limit }) {
  const client = new RockskyClient();
  const artists = await client.getArtists(did, { skip, limit });
  let rank = 1;
  for (const artist of artists) {
    console.log(
      `${rank} ${chalk.magenta(artist.name)} ${chalk.yellow(
        artist.play_count + " plays"
      )}`
    );
    rank++;
  }
}
