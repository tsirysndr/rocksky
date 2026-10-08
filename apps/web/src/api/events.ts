import { rocksky } from "../lib/rocksky";
import type { ArtistEvent } from "../types/event";

export async function getArtistEvents(
  uri: string,
  limit: number,
  offset: number,
): Promise<ArtistEvent[]> {
  const data = (await rocksky().get("app.rocksky.artist.getArtistEvents", {
    uri,
    limit,
    offset,
    includePast: false,
  })) as { events: ArtistEvent[] };
  return data.events;
}
