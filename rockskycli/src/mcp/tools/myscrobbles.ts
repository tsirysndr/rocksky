import { RockskyClient } from "client";
import dayjs from "dayjs";
import relative from "dayjs/plugin/relativeTime.js";
import fs from "fs/promises";
import os from "os";
import path from "path";

dayjs.extend(relative);

export async function myscrobbles({ skip, limit }): Promise<string> {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    return "You are not logged in. Please run `rocksky login <username>.bsky.social` first.";
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token) {
    return "You are not logged in. Please run `rocksky login <username>.bsky.social` first.";
  }

  const client = new RockskyClient(token);
  try {
    const { did } = await client.getCurrentUser();
    const scrobbles = await client.scrobbles(did, { skip, limit });

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
  } catch (err) {
    return `Failed to fetch scrobbles data. Please check your token and try again, error: ${err.message}`;
  }
}
