import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { c } from "theme";

export async function createApiKey(name, { description }) {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    console.error(
      `You are not logged in. Please run ${c.primary(
        "`rocksky login <username>.bsky.social`"
      )} first.`
    );
    return;
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token) {
    console.error(
      `You are not logged in. Please run ${c.primary(
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
  console.log(`Name: ${c.primary(apikey.name)}`);
  if (apikey.description) {
    console.log(`Description: ${c.primary(apikey.description)}`);
  }
  console.log(`Key: ${c.primary(apikey.api_key)}`);
  console.log(`Secret: ${c.primary(apikey.shared_secret)}`);
}
