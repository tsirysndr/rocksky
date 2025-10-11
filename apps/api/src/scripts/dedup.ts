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
const records = await agent.com.atproto.repo.listRecords({
  repo: agent.assertDid,
  collection: "app.rocksky.scrobble",
  limit: 100,
});

for (const record of records.data.records) {
  const result = await ctx.db
    .select()
    .from(tables.scrobbles)
    .where(eq(tables.scrobbles.uri, record.uri))
    .limit(1);
  if (result.length === 0) {
    console.log(`Deleting record ${record.rkey}...`);
    console.log("deleting record:");
    console.log(record);
    /*await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.scrobble",
      rkey: record.rkey,
    });
    */
  } else {
    console.log(`Keeping record:`);
    console.log(record);
  }
}
