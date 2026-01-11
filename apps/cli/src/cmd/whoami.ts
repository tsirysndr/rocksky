import chalk from "chalk";
import { RockskyClient } from "client";
import fs from "fs/promises";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import { getDidAndHandle } from "lib/getDidAndHandle";
import os from "os";
import path from "path";
import { createUser } from "./sync";
import { ctx } from "context";
import schema from "schema";
import { eq } from "drizzle-orm";

export async function whoami() {
  if (env.ROCKSKY_IDENTIFIER && env.ROCKSKY_PASSWORD) {
    const [did, handle] = await getDidAndHandle();
    const agent = await createAgent(did, handle);
    let user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, did))
      .execute()
      .then((rows) => rows[0]);

    if (!user) {
      user = await createUser(agent, did, handle);
    }

    console.log(`You are logged in as ${user.handle} (${user.displayName}).`);
    console.log(
      `View your profile at: ${chalk.magenta(
        `https://rocksky.app/profile/${user.handle}`,
      )}`,
    );
    return;
  }
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    console.error(
      `You are not logged in. Please run ${chalk.greenBright(
        "`rocksky login <username>.bsky.social`",
      )} first.`,
    );
    return;
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token) {
    console.error(
      `You are not logged in. Please run ${chalk.greenBright(
        "`rocksky login <username>.bsky.social`",
      )} first.`,
    );
    return;
  }

  const client = new RockskyClient(token);
  try {
    const user = await client.getCurrentUser();
    console.log(`You are logged in as ${user.handle} (${user.displayName}).`);
    console.log(
      `View your profile at: ${chalk.magenta(
        `https://rocksky.app/profile/${user.handle}`,
      )}`,
    );
  } catch (err) {
    console.error(
      `Failed to fetch user data. Please check your token and try again.`,
    );
  }
}
