import chalk from "chalk";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import { createAgent } from "lib/agent";
import tables from "schema";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Please provide user author identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run feed -- <handle|did>")}`);
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
      console.log(`${i} Deleting record:`);
      console.log(record);
      const rkey = record.uri.split("/").pop();
      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: "app.rocksky.scrobble",
        rkey,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // rate limit
    } else {
      console.log(chalk.greenBright(`${i} Keeping record:`));
      console.log(record);
    }
    i += 1;
  }
  cursor = records.data.cursor;
} while (cursor);

console.log(chalk.greenBright("Deduplication complete."));

process.exit(0);
