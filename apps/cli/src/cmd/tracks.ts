import { RockskyClient } from "client";
import { c } from "theme";

export async function tracks(did, { skip, limit }) {
  const client = new RockskyClient();
  const tracks = await client.getTracks(did, { skip, limit });
  let rank = 1;
  for (const track of tracks) {
    console.log(
      `${rank} ${c.accent(track.title)} ${track.artist} ${c.link(
        track.play_count + " plays"
      )}`
    );
    rank++;
  }
}
