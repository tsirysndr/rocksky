import { RockskyClient } from "client";
import { c } from "theme";

export async function albums(did, { skip, limit }) {
  const client = new RockskyClient();
  const albums = await client.getAlbums(did, { skip, limit });
  let rank = 1;
  for (const album of albums) {
    console.log(
      `${rank} ${c.accent(album.title)} ${album.artist} ${c.link(
        album.play_count + " plays"
      )}`
    );
    rank++;
  }
}
