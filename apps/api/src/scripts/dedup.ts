import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import { createAgent } from "lib/agent";
import tables from "schema";

const args = process.argv.slice(2);

if (args.length === 0) {
  consola.error("Please provide user author identifier (handle or DID).");
  consola.info(`Usage: ${chalk.cyan("npm run feed -- <handle|did>")}`);
  process.exit(1);
}

let did = args[0];

if (!did.startsWith("did:plc:")) {
  did = await ctx.baseIdResolver.handle.resolve(did);
}

const agent = await createAgent(ctx.oauthClient, did);
let cursor: string | undefined;
const BATCH_SIZE = 100;
let i = 1;
do {
  const records = await agent.com.atproto.repo.listRecords({
    repo: agent.assertDid,
    collection: "app.rocksky.scrobble",
    limit: BATCH_SIZE,
  });

  for (const record of records.data.records) {
    const result = await ctx.db
      .select()
      .from(tables.scrobbles)
      .where(eq(tables.scrobbles.uri, record.uri))
      .limit(1);
    if (result.length === 0) {
      consola.info(`${i} Deleting record:`);
      consola.info(record);
      const rkey = record.uri.split("/").pop();
      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: "app.rocksky.scrobble",
        rkey,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // rate limit
    } else {
      consola.info(chalk.greenBright(`${i} Keeping record:`));
      consola.info(record);
    }
    i += 1;
  }
  cursor = records.data.cursor;
} while (cursor);

consola.info(chalk.greenBright("Deduplication complete."));

process.exit(0);
