import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function nowplaying(did?: string): Promise<string> {
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

  const client = new RockskyClient(token);
  try {
    const nowPlaying = await client.getSpotifyNowPlaying(did);
    if (!nowPlaying || Object.keys(nowPlaying).length === 0) {
      const nowPlaying = await client.getNowPlaying(did);
      if (!nowPlaying || Object.keys(nowPlaying).length === 0) {
        return "No track is currently playing.";
      }
      return JSON.stringify(
        {
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          album: nowPlaying.album,
        },
        null,
        2
      );
    }

    return JSON.stringify(
      {
        title: nowPlaying.item.name,
        artist: nowPlaying.item.artists.map((a) => a.name).join(", "),
        album: nowPlaying.item.album.name,
      },
      null,
      2
    );
  } catch (err) {
    return `Failed to fetch now playing data. Please check your token and try again, error: ${err.message}`;
  }
}
