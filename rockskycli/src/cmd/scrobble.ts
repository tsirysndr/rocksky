import chalk from "chalk";
import { RockskyClient } from "client";
import fs from "fs/promises";
import md5 from "md5";
import os from "os";
import path from "path";

export async function scrobble(track, artist, { timestamp }) {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    console.error(
      `You are not logged in. Please run ${chalk.greenBright(
        "`rocksky login <username>.bsky.social`"
      )} first.`
    );
    return;
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token) {
    console.error(
      `You are not logged in. Please run ${chalk.greenBright(
        "`rocksky login <username>.bsky.social`"
      )} first.`
    );
    return;
  }

  const client = new RockskyClient(token);
  const apikeys = await client.getApiKeys();

  if (!apikeys || apikeys.length === 0 || !apikeys[0].enabled) {
    console.error(
      `You don't have any API keys. Please create one using ${chalk.greenBright(
        "`rocksky create apikey`"
      )} command.`
    );
    return;
  }

  const signature = md5(
    `api_key${
      apikeys[0].apiKey
    }artist[0]${artist}methodtrack.scrobblesk${token}timestamp[0]${
      timestamp || Math.floor(Date.now() / 1000)
    }track[0]${track}${apikeys[0].sharedSecret}`
  );

  const response = await client.scrobble(
    apikeys[0].apiKey,
    signature,
    track,
    artist,
    timestamp
  );

  console.log(
    `Scrobbled ${chalk.greenBright(track)} by ${chalk.greenBright(
      artist
    )} at ${chalk.greenBright(
      new Date(
        (timestamp || Math.floor(Date.now() / 1000)) * 1000
      ).toLocaleString()
    )}`
  );
}
