import { RockskyClient } from "client";

export async function albums(did, { skip, limit = 20 }): Promise<string> {
  const client = new RockskyClient();
  const albums = await client.getAlbums(did, { skip, limit });
  let rank = 1;
  let response = `Top ${limit} albums:\n`;
  for (const album of albums) {
    response += `${rank} ${album.title} - ${album.artist} - ${album.play_count} plays\n`;
    rank++;
  }
  return response;
}
