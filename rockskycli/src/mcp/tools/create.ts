import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function createApiKey(name, { description }) {
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
  const apikey = await client.createApiKey(name, description);
  if (!apikey) {
    return "Failed to create API key. Please try again later.";
  }

  return "API key created successfully!, navigate to your Rocksky account to view it.";
}
