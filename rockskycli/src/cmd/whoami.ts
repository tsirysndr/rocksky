import chalk from "chalk";
import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function whoami() {
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
  try {
    const user = await client.getCurrentUser();
    console.log(`You are logged in as ${user.handle} (${user.displayName}).`);
    console.log(
      `View your profile at: ${chalk.magenta(
        `https://rocksky.app/profile/${user.handle}`
      )}`
    );
  } catch (err) {
    console.error(
      `Failed to fetch user data. Please check your token and try again.`
    );
  }
}
