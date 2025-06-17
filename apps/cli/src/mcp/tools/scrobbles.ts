import { RockskyClient } from "client";
import dayjs from "dayjs";
import relative from "dayjs/plugin/relativeTime.js";

dayjs.extend(relative);

export async function scrobbles(did, { skip, limit }): Promise<string> {
  try {
    const client = new RockskyClient();
    const scrobbles = await client.scrobbles(did, { skip, limit });

    if (did) {
      return JSON.stringify(
        scrobbles.map((scrobble) => ({
          title: scrobble.title,
          artist: scrobble.artist,
          date: dayjs(scrobble.created_at + "Z").fromNow(),
          isoDate: scrobble.created_at,
        })),
        null,
        2
      );
    }

    return JSON.stringify(
      scrobbles.map((scrobble) => ({
        user: `@${scrobble.user}`,
        title: scrobble.title,
        artist: scrobble.artist,
        date: dayjs(scrobble.date).fromNow(),
        isoDate: scrobble.date,
      })),
      null,
      2
    );
  } catch (err) {
    return `Failed to fetch scrobbles data. Please check your token and try again, error: ${err.message}`;
  }
}
