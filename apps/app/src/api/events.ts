import { client } from ".";
import type { ArtistEvent } from "../types/event";

export async function getArtistEvents(
  uri: string,
  limit: number,
  offset: number,
): Promise<ArtistEvent[]> {
  const { data } = await client.get<{ events: ArtistEvent[] }>(
    "/xrpc/app.rocksky.artist.getArtistEvents",
    {
      params: { uri, limit, offset, includePast: false },
    },
  );
  return data.events;
}
