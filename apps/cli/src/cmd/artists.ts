import { RockskyClient } from "client";
import { c } from "theme";

export async function artists(did, { skip, limit }) {
  const client = new RockskyClient();
  const artists = await client.getArtists(did, { skip, limit });
  let rank = 1;
  for (const artist of artists) {
    console.log(
      `${rank} ${c.accent(artist.name)} ${c.link(
        artist.play_count + " plays"
      )}`
    );
    rank++;
  }
}
