import chalk from "chalk";
import { ctx } from "context";
import { createAgent } from "lib/agent";

export async function refreshSessions() {
  const keys = await ctx.redis.keys("refresh:*");
  return new Promise<void>((resolve) => {
    for (const key of keys) {
      const did = key.split("refresh:")[1];
      setTimeout(() => {
        setInterval(
          async () => {
            createAgent(ctx.oauthClient, did).catch(() => {});
            console.log(`Refreshing agent for ${chalk.greenBright(did)}`);
          },
          // every 5 minutes
          5 * 60 * 1000
        );
      }, 5 * 1000);
    }

    console.log(`Refreshed ${chalk.greenBright(keys.length)} sessions`);
    resolve();
  });
}
