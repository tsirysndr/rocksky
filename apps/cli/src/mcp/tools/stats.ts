import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function stats(did?: string): Promise<string> {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    if (!did) {
      return "You are not logged in. Please run `rocksky login <username>.bsky.social` first.";
    }
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token && !did) {
    return "You are not logged in. Please run `rocksky login <username>.bsky.social` first.";
  }

  try {
    const client = new RockskyClient(token);
    const stats = await client.stats(did);

    return JSON.stringify(
      {
        scrobbles: stats.scrobbles,
        tracks: stats.tracks,
        albums: stats.albums,
        artists: stats.artists,
        lovedTracks: stats.lovedTracks,
      },
      null,
      2
    );
  } catch (err) {
    return `Failed to fetch stats data. Please check your token and try again, error: ${err.message}`;
  }
}
