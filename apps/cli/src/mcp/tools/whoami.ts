import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function whoami(): Promise<string> {
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
    const user = await client.getCurrentUser();
    return `You are logged in as ${user.handle} (${user.displayName}).\nView your profile at: https://rocksky.app/profile/${user.handle}`;
  } catch (err) {
    return "Failed to fetch user data. Please check your token and try again.";
  }
}
