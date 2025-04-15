import chalk from "chalk";
import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";
import chalk from "chalk";

export async function nowplaying(did?: string) {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    console.error(
      `You are not logged in. Please run ${
        chalk.greenBright(
          "`rocksky login <username>.bsky.social`",
        )
      } first.`,
    );
    return;
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token) {
    console.error(
      `You are not logged in. Please run ${
        chalk.greenBright(
          "`rocksky login <username>.bsky.social`",
        )
      } first.`,
    );
    return;
  }

  const client = new RockskyClient(token);
  try {
    const nowPlaying = await client.getSpotifyNowPlaying(did);
    if (!nowPlaying || Object.keys(nowPlaying).length === 0) {
      const nowPlaying = await client.getNowPlaying(did);
      if (!nowPlaying || Object.keys(nowPlaying).length === 0) {
        console.log("No track is currently playing.");
        return;
      }
      console.log(chalk.magenta(`${nowPlaying.title} - ${nowPlaying.artist}`));
      console.log(`${nowPlaying.album}`);
      return;
    }

    console.log(
      chalk.magenta(
        `${nowPlaying.item.name} - ${
          nowPlaying.item.artists
            .map((a) => a.name)
            .join(", ")
        }`,
      ),
    );
    console.log(`${nowPlaying.item.album.name}`);
  } catch (err) {
    console.log(err);
    console.error(
      `Failed to fetch now playing data. Please check your token and try again.`,
    );
  }
}
