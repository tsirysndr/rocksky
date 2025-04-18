import chalk from "chalk";
import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function createApiKey(name, { description }) {
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
  const apikey = await client.createApiKey(name, description);
  if (!apikey) {
    console.error(`Failed to create API key. Please try again later.`);
    return;
  }

  console.log(`API key created successfully!`);
  console.log(`Name: ${chalk.greenBright(apikey.name)}`);
  if (apikey.description) {
    console.log(`Description: ${chalk.greenBright(apikey.description)}`);
  }
  console.log(`Key: ${chalk.greenBright(apikey.api_key)}`);
  console.log(`Secret: ${chalk.greenBright(apikey.shared_secret)}`);
}
