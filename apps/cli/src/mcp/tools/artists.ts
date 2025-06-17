import { RockskyClient } from "client";

export async function artists(did, { skip, limit = 20 }): Promise<string> {
  try {
    const client = new RockskyClient();
    const artists = await client.getArtists(did, { skip, limit });
    let rank = 1;
    let response = `Top ${limit} artists:\n`;
    for (const artist of artists) {
      response += `${rank} ${artist.name} - ${artist.play_count} plays\n`;
      rank++;
    }
    return response;
  } catch (err) {
    return `Failed to fetch artists data. Please check your token and try again, error: ${err.message}`;
  }
}
