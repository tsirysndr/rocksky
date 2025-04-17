import chalk from "chalk";
import { RockskyClient } from "client";

export async function tracks(did, { skip, limit }) {
  const client = new RockskyClient();
  const tracks = await client.getTracks(did, { skip, limit });
  let rank = 1;
  for (const track of tracks) {
    console.log(
      `${rank} ${chalk.magenta(track.title)} ${track.artist} ${chalk.yellow(
        track.play_count + " plays"
      )}`
    );
    rank++;
  }
}
