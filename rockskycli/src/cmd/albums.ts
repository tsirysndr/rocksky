import chalk from "chalk";
import { RockskyClient } from "client";

export async function albums(did, { skip, limit }) {
  const client = new RockskyClient();
  const albums = await client.getAlbums(did, { skip, limit });
  let rank = 1;
  for (const album of albums) {
    console.log(
      `${rank} ${chalk.magenta(album.title)} ${album.artist} ${chalk.yellow(
        album.play_count + " plays"
      )}`
    );
    rank++;
  }
}
