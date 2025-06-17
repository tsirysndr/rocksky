import { RockskyClient } from "client";

export async function tracks(did, { skip, limit = 20 }) {
  const client = new RockskyClient();
  const tracks = await client.getTracks(did, { skip, limit });
  let rank = 1;
  let response = `Top ${limit} tracks:\n`;

  for (const track of tracks) {
    response += `${rank} ${track.title} - ${track.artist} - ${track.play_count} plays\n`;
    rank++;
  }

  return response;
}
